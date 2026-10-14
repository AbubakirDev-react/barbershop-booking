// Отправка напоминаний о записи через Resend.
// Вызывается pg_cron раз в 5 минут с заголовком x-cron-secret (секрет в Vault).
// Секреты функции (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY — ключ Resend (обязательно)
//   RESEND_FROM    — отправитель, например "Барбершоп <noreply@ваш-домен.ru>".
//                    Без своего домена Resend доставляет письма только на email владельца аккаунта Resend.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

interface Task {
  task_id: string
  kind: 'reminder_24h' | 'reminder_2h'
  attempts: number
  appointment_number: number
  starts_at: string
  ends_at: string
  client_name: string
  email: string
  master_name: string
  services: string | null
  total: number | string
  shop_name: string
  shop_address: string
  shop_phone: string
  timezone: string
}

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function renderEmail(t: Task) {
  const tz = t.timezone || 'Europe/Moscow'
  const when = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(t.starts_at))
  const shop = t.shop_name || 'Барбершоп'
  const lead = t.kind === 'reminder_24h' ? 'Напоминаем: завтра у вас запись' : 'Через 2 часа у вас запись'
  const price = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(t.total))
  const rows: [string, string][] = [
    ['Когда', when],
    ['Мастер', t.master_name],
    ['Услуги', t.services ?? ''],
    ['Стоимость', `${price}, оплата в барбершопе`],
  ]
  if (t.shop_address) rows.push(['Адрес', t.shop_address])
  if (t.shop_phone) rows.push(['Телефон', t.shop_phone])

  const subject = `${lead} — ${shop}`
  const html = `<!doctype html><html lang="ru"><body style="margin:0;padding:24px;background:#f1f2ee;font-family:Arial,sans-serif;color:#13191f">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:24px">
    <p style="margin:0 0 4px;color:#5d6670;font-size:14px">${esc(shop)}</p>
    <h1 style="margin:0 0 16px;font-size:20px">${esc(lead)}</h1>
    <p style="margin:0 0 16px">${esc(t.client_name)}, ждём вас. Запись №${t.appointment_number}.</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#5d6670;width:110px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('')}
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:#5d6670">Перенести или отменить запись можно в профиле на сайте или по телефону барбершопа.</p>
  </div></body></html>`
  const text = `${lead}\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\nЗапись №${t.appointment_number}`
  return { subject, html, text }
}

Deno.serve(async (req) => {
  const { data: allowed, error: secretError } = await supabase.rpc('check_cron_secret', {
    p_secret: req.headers.get('x-cron-secret') ?? '',
  })
  if (secretError || !allowed) return new Response('forbidden', { status: 403 })

  const apiKey = Deno.env.get('RESEND_API_KEY')
  // Без ключа задачи не трогаем: они дождутся настройки, а не сгорят попытками
  if (!apiKey) return Response.json({ ok: false, error: 'RESEND_API_KEY не задан' }, { status: 503 })
  const from = Deno.env.get('RESEND_FROM') || 'Барбершоп <onboarding@resend.dev>'

  const { data, error } = await supabase.rpc('claim_due_reminders', { p_limit: 50 })
  if (error) {
    console.error('claim_due_reminders', error.message)
    return Response.json({ ok: false }, { status: 500 })
  }

  const tasks = (data ?? []) as Task[]
  let sent = 0
  for (const t of tasks) {
    const mail = renderEmail(t)
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // Повтор того же напоминания не отправит второе письмо
          'Idempotency-Key': `reminder-${t.task_id}`,
        },
        body: JSON.stringify({ from, to: [t.email], subject: mail.subject, html: mail.html, text: mail.text }),
      })
      if (res.ok) {
        sent++
        await supabase.rpc('complete_reminder', { p_task: t.task_id, p_ok: true })
      } else {
        const body = await res.text()
        // 4xx (кроме 429) — ошибка данных/настроек, повтор не поможет
        const final = res.status >= 400 && res.status < 500 && res.status !== 429
        // В журнал — только код и текст Resend, без адреса и содержимого письма
        console.warn('resend error', res.status, body.slice(0, 200))
        await supabase.rpc('complete_reminder', { p_task: t.task_id, p_ok: false, p_error: `Resend ${res.status}: ${body.slice(0, 300)}`, p_final: final })
      }
    } catch (e) {
      console.warn('network error', (e as Error).message)
      await supabase.rpc('complete_reminder', { p_task: t.task_id, p_ok: false, p_error: `Сеть: ${(e as Error).message}` })
    }
  }
  return Response.json({ ok: true, claimed: tasks.length, sent })
})
