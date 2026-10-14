// Вебхук Telegram-бота для напоминаний.
//   POST от Telegram — проверяется заголовок X-Telegram-Bot-Api-Secret-Token (секрет в Vault).
//   POST ?setup=1 с x-cron-secret — регистрирует вебхук и сохраняет username бота в настройках.
// Секрет функции: TELEGRAM_BOT_TOKEN (Supabase → Edge Functions → Secrets).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})
const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
const api = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json())

const reply = (chatId: number, text: string) => api('sendMessage', { chat_id: chatId, text })

async function setup(req: Request) {
  const { data: allowed } = await supabase.rpc('check_cron_secret', { p_secret: req.headers.get('x-cron-secret') ?? '' })
  if (!allowed) return new Response('forbidden', { status: 403 })
  if (!token) return Response.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN не задан' }, { status: 503 })

  const me = await api('getMe', {})
  if (!me.ok) return Response.json({ ok: false, error: 'Токен бота не принят Telegram' }, { status: 400 })

  const { data: secret } = await supabase.rpc('get_telegram_webhook_secret')
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-webhook`
  const hook = await api('setWebhook', { url, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true })
  await api('setMyCommands', { commands: [{ command: 'stop', description: 'Отключить напоминания' }] })

  // Username нужен сайту для ссылки t.me/<bot>?start=<код>
  const { error } = await supabase.from('shop_settings').update({ telegram_bot_username: me.result.username }).eq('id', 1)
  return Response.json({ ok: hook.ok && !error, username: me.result.username, webhook: hook.description })
}

Deno.serve(async (req) => {
  if (new URL(req.url).searchParams.get('setup') === '1') return setup(req)

  const { data: allowed } = await supabase.rpc('check_telegram_webhook_secret', {
    p_secret: req.headers.get('x-telegram-bot-api-secret-token') ?? '',
  })
  if (!allowed) return new Response('forbidden', { status: 403 })
  if (!token) return new Response('ok')

  // На любые сбои отвечаем 200: иначе Telegram будет бесконечно повторять апдейт
  try {
    const update = await req.json()
    const msg = update?.message
    const chatId: number | undefined = msg?.chat?.id
    const text: string = (msg?.text ?? '').trim()
    if (!chatId || msg?.chat?.type !== 'private') return new Response('ok')

    if (text.startsWith('/start')) {
      const code = text.split(/\s+/)[1] ?? ''
      if (!code) {
        await reply(chatId, 'Чтобы получать напоминания о записи, откройте профиль на сайте барбершопа → Настройки → «Подключить Telegram».')
        return new Response('ok')
      }
      const { data: name, error } = await supabase.rpc('link_telegram', { p_code: code, p_chat_id: chatId })
      if (error) throw error
      await reply(
        chatId,
        name
          ? `Готово, ${name}! Напоминания о записях будут приходить сюда за 24 и за 2 часа. Отключить — команда /stop.`
          : 'Ссылка устарела. Нажмите «Подключить Telegram» в профиле на сайте ещё раз.',
      )
    } else if (text === '/stop') {
      const { data: unlinked } = await supabase.rpc('unlink_telegram_chat', { p_chat_id: chatId })
      await reply(chatId, unlinked ? 'Напоминания отключены. Подключить снова можно в профиле на сайте.' : 'Этот чат не был подключён.')
    } else {
      await reply(chatId, 'Я присылаю только напоминания о записях. Отключить — /stop.')
    }
  } catch (e) {
    console.error('telegram-webhook', (e as Error).message)
  }
  return new Response('ok')
})
