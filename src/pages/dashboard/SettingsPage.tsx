import { useState } from 'react'
import { useDb } from '@/data/store'
import { useCurrentUser } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import type { ShopSettings } from '@/domain/types'
import { Button, Checkbox, Field, Input, PhotoInput, Select, Textarea, useToast } from '@/shared/ui'

export default function SettingsPage() {
  usePageMeta('Настройки', '', { noindex: true })
  const user = useCurrentUser()!
  const isOwner = user.role === 'owner'
  const settings = useDb((s) => s.settings)
  const updateSettings = useDb((s) => s.updateSettings)
  const toast = useToast()
  const [form, setForm] = useState<ShopSettings>(settings)
  const [saving, setSaving] = useState(false)
  // Если настройки перечитались с сервера, а форма не трогалась — показываем свежие
  const [synced, setSynced] = useState(settings)
  if (synced !== settings) {
    setSynced(settings)
    if (JSON.stringify(form) === JSON.stringify(synced)) setForm(settings)
  }

  const set = <K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) => setForm({ ...form, [key]: value })
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : fallback)
  const dirty = JSON.stringify(form) !== JSON.stringify(settings)

  if (!isOwner) {
    return (
      <>
        <div className="dash-head"><div><h1>Настройки</h1></div></div>
        <div className="panel stack">
          <p>Настройки барбершопа меняет владелец.</p>
          <p className="muted">Ваш профиль и личные уведомления — в разделе «Профиль» на сайте.</p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Настройки</h1>
          <p>Эти данные показываются на сайте. Ничего не выдумываем — пустые поля скрыты.</p>
        </div>
        <Button
          variant="primary"
          disabled={!dirty}
          loading={saving}
          onClick={async () => {
            setSaving(true)
            const patch: Partial<ShopSettings> = { ...form }
            // Фото отправляем только если его заменили или удалили
            if (form.heroPhoto === settings.heroPhoto) delete patch.heroPhoto
            const res = await updateSettings(patch)
            setSaving(false)
            if (!res.ok) return toast(res.error, 'error')
            setForm(useDb.getState().settings)
            toast('Настройки сохранены')
          }}
        >
          Сохранить
        </Button>
      </div>

      <section className="panel stack" aria-labelledby="s-shop">
        <h2 id="s-shop" style={{ fontSize: 'var(--fs-lg)' }}>Барбершоп</h2>
        <div className="form-grid form-grid--2">
          <Field label="Название">{(p) => <Input {...p} value={form.name} maxLength={60} onChange={(e) => set('name', e.target.value)} />}</Field>
          <Field label="Телефон">{(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />}</Field>
          <Field label="Адрес" className="span-2">{(p) => <Input {...p} value={form.address} onChange={(e) => set('address', e.target.value)} />}</Field>
          <Field label="Описание" hint="Показывается на главной под названием" className="span-2">
            {(p) => <Textarea {...p} value={form.description} maxLength={300} onChange={(e) => set('description', e.target.value)} />}
          </Field>
          <Field label="Часы работы (свой текст)" hint="Необязательно. Если пусто — часы строятся по расписанию мастеров" className="span-2">
            {(p) => <Textarea {...p} style={{ minHeight: 70 }} value={form.hoursNote} onChange={(e) => set('hoursNote', e.target.value)} />}
          </Field>
        </div>
        <PhotoInput label="Фото для главной страницы" value={form.heroPhoto} onChange={(v) => set('heroPhoto', v)} />
        <div className="form-grid form-grid--2">
          {(
            [
              ['yandexMaps', 'Ссылка на Яндекс Карты'],
              ['twoGis', 'Ссылка на 2ГИС'],
              ['telegram', 'Telegram'],
              ['instagram', 'Instagram'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              {(p) => <Input {...p} type="url" placeholder="https://" value={form.links[key]} onChange={(e) => setForm({ ...form, links: { ...form.links, [key]: e.target.value } })} />}
            </Field>
          ))}
        </div>
      </section>

      <section className="panel stack" aria-labelledby="s-rules">
        <h2 id="s-rules" style={{ fontSize: 'var(--fs-lg)' }}>Правила записи</h2>
        <div className="form-grid form-grid--2">
          <Field label="Часовой пояс">
            {(p) => (
              <Select {...p} value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                {['Europe/Kaliningrad', 'Europe/Moscow', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka'].map((z) => <option key={z}>{z}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Шаг слотов">
            {(p) => (
              <Select {...p} value={form.slotStepMinutes} onChange={(e) => set('slotStepMinutes', Number(e.target.value))}>
                {[15, 20, 30, 60].map((n) => <option key={n} value={n}>{n} минут</option>)}
              </Select>
            )}
          </Field>
          <Field label="Минимум до записи, мин" hint="Не раньше чем через столько минут">{(p) => <Input {...p} inputMode="numeric" value={form.minLeadMinutes} onChange={(e) => set('minLeadMinutes', Math.max(0, num(e.target.value, 0)))} />}</Field>
          <Field label="Горизонт записи, дней">{(p) => <Input {...p} inputMode="numeric" value={form.horizonDays} onChange={(e) => set('horizonDays', Math.min(365, Math.max(1, num(e.target.value, 30))))} />}</Field>
          <Field label="Отмена онлайн, не позднее чем за (ч)">{(p) => <Input {...p} inputMode="numeric" value={form.cancelBeforeHours} onChange={(e) => set('cancelBeforeHours', Math.max(0, num(e.target.value, 0)))} />}</Field>
          <Field label="Перенос онлайн, не позднее чем за (ч)">{(p) => <Input {...p} inputMode="numeric" value={form.rescheduleBeforeHours} onChange={(e) => set('rescheduleBeforeHours', Math.max(0, num(e.target.value, 0)))} />}</Field>
        </div>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
          Если вы изменили рабочие часы мастеров, проверьте уже созданные записи: автоматически они не отменяются.
        </p>
      </section>

      <section className="panel stack" aria-labelledby="s-reminders">
        <h2 id="s-reminders" style={{ fontSize: 'var(--fs-lg)' }}>Напоминания клиентам</h2>
        <p style={{ fontSize: 'var(--fs-sm)' }}>
          Telegram-бот:{' '}
          {settings.telegramBotUsername ? (
            <a href={`https://t.me/${settings.telegramBotUsername}`} target="_blank" rel="noopener noreferrer">@{settings.telegramBotUsername}</a>
          ) : (
            <span className="muted">не подключён</span>
          )}
        </p>
        <Checkbox
          label="Email-напоминания"
          hint="Включайте, только если в Resend подтверждён ваш домен. Без домена письма доходят лишь до владельца аккаунта Resend."
          checked={form.emailRemindersEnabled}
          onChange={(e) => set('emailRemindersEnabled', e.target.checked)}
        />
      </section>

    </>
  )
}
