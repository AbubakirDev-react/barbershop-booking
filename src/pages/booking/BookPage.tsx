import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDb } from '@/data/store'
import { useCurrentUser, usePublicMasters, usePublicServices, useSortedCategories } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { calcTotals, MAX_SERVICES_PER_APPOINTMENT, toItem } from '@/domain/pricing'
import { findNextSlot } from '@/domain/slots'
import { formatDateTime, formatDuration, formatRub, formatTime, formatWeekdayDate } from '@/domain/format'
import type { Appointment, Master } from '@/domain/types'
import { workDaysText } from '@/features/catalog/MasterCard'
import { SlotPicker } from '@/features/booking/SlotPicker'
import { Avatar, Button, Checkbox, EmptyState, Field, Icon, Input, StatusBadge } from '@/shared/ui'
import { normalizePhone, phoneSchema } from '@/shared/validation'
import '@/features/booking/booking.css'

const STEPS = ['Мастер', 'Услуги', 'Дата и время', 'Подтверждение'] as const
const DRAFT_KEY = 'booking-draft'

interface Draft {
  requestId: string
  masterId: string | null
  serviceIds: string[]
  startsAt: string | null
  step: number
}

const newDraft = (): Draft => ({ requestId: crypto.randomUUID(), masterId: null, serviceIds: [], startsAt: null, step: 0 })

/**
 * Черновик записи живёт в sessionStorage: если клиенту нужно войти перед
 * подтверждением, выбор не теряется. requestId создаётся один раз на черновик —
 * это ключ идемпотентности, повторный клик не создаст вторую запись.
 */
function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}
function saveDraft(d: Draft | null) {
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // sessionStorage недоступен — черновик просто не переживёт перезагрузку
  }
}

export default function BookPage() {
  usePageMeta('Онлайн-запись', 'Выберите мастера, услуги и свободное время.')
  const [params] = useSearchParams()
  const masters = usePublicMasters()
  const services = usePublicServices()

  const [draft, setDraft] = useState<Draft>(() => {
    const saved = loadDraft()
    const masterParam = params.get('master')
    const serviceParam = params.get('service')
    if (masterParam || serviceParam) {
      return { ...newDraft(), masterId: masterParam, serviceIds: serviceParam ? [serviceParam] : [] }
    }
    return saved ?? newDraft()
  })
  const [created, setCreated] = useState<Appointment | null>(null)

  useEffect(() => {
    if (!created) saveDraft(draft)
  }, [draft, created])

  const master = masters.find((m) => m.id === draft.masterId) ?? null
  const chosen = useMemo(
    () => draft.serviceIds.map((id) => services.find((s) => s.id === id)).filter((s) => s !== undefined),
    [draft.serviceIds, services],
  )
  const totals = calcTotals(chosen.map(toItem))

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const canGo = [true, !!master, !!master && chosen.length > 0, !!draft.startsAt]
  const maxStep = canGo.lastIndexOf(true)
  const step = Math.min(draft.step, maxStep)

  if (created) return <BookingSuccess appt={created} onAgain={() => { setCreated(null); setDraft(newDraft()) }} />

  if (!masters.length || !services.length) {
    return (
      <div className="container" style={{ paddingBlock: 'var(--sp-7)' }}>
        <h1 style={{ marginBottom: 'var(--sp-5)' }}>Онлайн-запись</h1>
        <EmptyState
          title="Онлайн-запись пока недоступна"
          text="Барбершоп ещё не опубликовал мастеров и услуги. Позвоните, чтобы записаться."
        />
      </div>
    )
  }

  return (
    <div className="container">
      <div className="book">
        <div>
          <h1 className="visually-hidden">Онлайн-запись</h1>
          <ol className="steps">
            {STEPS.map((label, i) => (
              <li key={label} className="steps__item" data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}>
                <button type="button" disabled={i > maxStep} onClick={() => update({ step: i })} aria-current={i === step ? 'step' : undefined}>
                  <span className="steps__num">{i + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <MasterStep
              masters={masters}
              selectedId={draft.masterId}
              requiredServiceIds={draft.serviceIds}
              onSelect={(id) => {
                // Смена мастера сбрасывает услуги, которые он не выполняет, и время
                const m = masters.find((x) => x.id === id)!
                update({ masterId: id, serviceIds: draft.serviceIds.filter((s) => m.serviceIds.includes(s)), startsAt: null, step: 1 })
              }}
            />
          )}
          {step === 1 && master && (
            <ServicesStep
              master={master}
              selected={draft.serviceIds}
              onChange={(ids) => update({ serviceIds: ids, startsAt: null })}
            />
          )}
          {step === 2 && master && (
            <section className="book__step">
              <h2>Дата и время</h2>
              <p className="muted">
                {master.name} · {formatDuration(totals.durationMinutes)}
              </p>
              <SlotPicker
                key={`${master.id}-${totals.durationMinutes}`}
                master={master}
                durationMinutes={totals.durationMinutes}
                value={draft.startsAt}
                onChange={(startsAt) => update({ startsAt })}
              />
            </section>
          )}
          {step === 3 && master && draft.startsAt && (
            <ConfirmStep
              draft={draft}
              master={master}
              onCreated={(a) => {
                saveDraft(null)
                setCreated(a)
              }}
              onSlotLost={() => update({ startsAt: null, step: 2 })}
              onBack={() => update({ step: 2 })}
            />
          )}

          {step < 3 && (
            <div className="book__nav">
              <Button variant="ghost" disabled={step === 0} onClick={() => update({ step: step - 1 })}>
                <Icon name="chevronLeft" /> Назад
              </Button>
              <Button variant="primary" disabled={!canGo[step + 1]} onClick={() => update({ step: step + 1 })}>
                Далее <Icon name="chevronRight" />
              </Button>
            </div>
          )}
        </div>

        <aside className="book__summary panel" aria-label="Ваша запись">
          <h2 style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--sp-4)' }}>Ваша запись</h2>
          <Summary master={master} items={chosen.map(toItem)} startsAt={draft.startsAt} />
        </aside>
      </div>
    </div>
  )
}

function Summary({
  master,
  items,
  startsAt,
}: {
  master: Master | null
  items: ReturnType<typeof toItem>[]
  startsAt: string | null
}) {
  const totals = calcTotals(items)
  return (
    <div className="summary">
      <div className="summary__row">
        <span className="muted">Мастер</span>
        <span>{master?.name ?? '—'}</span>
      </div>
      <div className="summary__row">
        <span className="muted">Когда</span>
        <span>{startsAt ? formatDateTime(startsAt) : '—'}</span>
      </div>
      {items.length > 0 ? (
        items.map((i) => (
          <div key={i.serviceId} className="summary__row">
            <span>
              {i.serviceName}
              <span className="muted"> · {formatDuration(i.durationMinutes)}</span>
            </span>
            <span className="num">{formatRub(i.price)}</span>
          </div>
        ))
      ) : (
        <div className="summary__row"><span className="muted">Услуги не выбраны</span></div>
      )}
      <div className="summary__total">
        <span>Итого{totals.durationMinutes > 0 && <span className="muted"> · {formatDuration(totals.durationMinutes)}</span>}</span>
        <strong className="num">{formatRub(totals.total)}</strong>
      </div>
      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Оплата в барбершопе после визита.</p>
    </div>
  )
}

function MasterStep({
  masters,
  selectedId,
  requiredServiceIds,
  onSelect,
}: {
  masters: Master[]
  selectedId: string | null
  requiredServiceIds: string[]
  onSelect: (id: string) => void
}) {
  const services = useDb((s) => s.services)
  const appointments = useDb((s) => s.busy)
  const timeOff = useDb((s) => s.timeOff)
  const settings = useDb((s) => s.settings)

  // Если клиент пришёл со страницы услуги — показываем только тех, кто её делает
  const list = masters.filter((m) => requiredServiceIds.every((id) => m.serviceIds.includes(id)))

  return (
    <section className="book__step">
      <h2>Выберите мастера</h2>
      <p className="muted">Ближайшее время рассчитано по расписанию мастера и уже занятым записям.</p>
      {list.length === 0 && (
        <div className="alert alert--warn" style={{ marginBottom: 'var(--sp-4)' }}>
          Выбранную услугу сейчас не выполняет ни один мастер.
        </div>
      )}
      <div className="pick-list">
        {list.map((m) => {
          const offered = services.filter((s) => s.active && m.serviceIds.includes(s.id))
          const shortest = offered.length ? Math.min(...offered.map((s) => s.durationMinutes)) : 0
          const next = shortest
            ? findNextSlot({
                master: m,
                durationMinutes: shortest,
                appointments,
                timeOff,
                rules: { stepMinutes: settings.slotStepMinutes, minLeadMinutes: settings.minLeadMinutes, horizonDays: settings.horizonDays },
              })
            : null
          const minPrice = offered.length ? Math.min(...offered.map((s) => s.price)) : null
          return (
            <button
              key={m.id}
              type="button"
              className="pick"
              aria-pressed={selectedId === m.id}
              disabled={!offered.length}
              onClick={() => onSelect(m.id)}
            >
              <Avatar name={m.name} photo={m.photo} size={56} />
              <span className="pick__body">
                <span className="pick__title">{m.name}</span>
                {m.specialization && <span className="pick__meta" style={{ color: 'var(--c-steel)' }}>{m.specialization}</span>}
                {m.bio && <span className="pick__meta">{m.bio}</span>}
                <span className="pick__meta">{workDaysText(m)}</span>
                <span className="pick__meta">
                  {offered.length === 0
                    ? 'Нет доступных услуг'
                    : next
                      ? `Ближайшее: ${formatWeekdayDate(next.startsAt)}, ${formatTime(next.startsAt)}`
                      : `Нет свободного времени в ближайшие ${settings.horizonDays} дн.`}
                </span>
              </span>
              {minPrice !== null && <span className="pick__side">от {formatRub(minPrice)}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ServicesStep({ master, selected, onChange }: { master: Master; selected: string[]; onChange: (ids: string[]) => void }) {
  const services = usePublicServices()
  const categories = useSortedCategories()
  const offered = services.filter((s) => master.serviceIds.includes(s.id))
  const full = selected.length >= MAX_SERVICES_PER_APPOINTMENT

  const groups = [
    ...categories.map((c) => ({ id: c.id, name: c.name, items: offered.filter((s) => s.categoryId === c.id) })),
    { id: 'other', name: 'Другое', items: offered.filter((s) => !categories.some((c) => c.id === s.categoryId)) },
  ].filter((g) => g.items.length)

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : full ? selected : [...selected, id])

  return (
    <section className="book__step">
      <h2>Выберите услуги</h2>
      <p className="muted">
        До {MAX_SERVICES_PER_APPOINTMENT} услуг в одной записи. Выбрано: {selected.length} из {MAX_SERVICES_PER_APPOINTMENT}.
      </p>
      {groups.map((g) => (
        <div key={g.id} style={{ marginBottom: 'var(--sp-5)' }}>
          <h3 style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-muted)', marginBottom: 'var(--sp-2)' }}>{g.name}</h3>
          <div className="pick-list" role="group" aria-label={g.name}>
            {g.items.map((s) => {
              const on = selected.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className="pick"
                  disabled={!on && full}
                  onClick={() => toggle(s.id)}
                >
                  <span className="pick__check" aria-hidden><Icon name="check" size={14} /></span>
                  <span className="pick__body">
                    <span className="pick__title">{s.name}</span>
                    {s.description && <span className="pick__meta">{s.description}</span>}
                    <span className="pick__meta">{formatDuration(s.durationMinutes)}</span>
                  </span>
                  <span className="pick__side">{formatRub(s.price)}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {full && <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Достигнут максимум услуг. Чтобы добавить другую, снимите одну из выбранных.</p>}
    </section>
  )
}

function ConfirmStep({
  draft,
  master,
  onCreated,
  onSlotLost,
  onBack,
}: {
  draft: Draft
  master: Master
  onCreated: (a: Appointment) => void
  onSlotLost: () => void
  onBack: () => void
}) {
  const user = useCurrentUser()
  const settings = useDb((s) => s.settings)
  const createAppointment = useDb((s) => s.createAppointment)
  const updateProfile = useDb((s) => s.updateProfile)
  const updatePrefs = useDb((s) => s.updatePrefs)
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!user) return
    setError('')
    const parsed = phoneSchema.safeParse(phone)
    if (!parsed.success) return setPhoneError(parsed.error.issues[0]!.message)
    setPhoneError('')
    setBusy(true)
    const normalized = normalizePhone(phone)
    if (normalized !== user.phone) {
      // Телефон сохраняем в профиль, но запись не зависит от успеха этого шага
      const saved = await updateProfile({ name: user.name, surname: user.surname, email: user.email, phone: normalized })
      if (!saved.ok) console.warn('[booking] телефон не сохранён в профиль:', saved.error)
    }
    const res = await createAppointment({
      requestId: draft.requestId,
      masterId: master.id,
      serviceIds: draft.serviceIds,
      startsAt: draft.startsAt!,
      clientName: [user.name, user.surname].filter(Boolean).join(' '),
      clientPhone: normalized,
      note,
      source: 'online',
    })
    setBusy(false)
    if (res.ok) return onCreated(res.value)
    setError(res.error)
  }

  return (
    <section className="book__step">
      <h2>Проверьте запись</h2>
      <p className="muted">Запись будет создана со статусом «Ожидает подтверждения» — мастер подтвердит её.</p>

      <div className="stack">
        <dl className="dl">
          <dt>Адрес</dt>
          <dd>{settings.address || 'Уточните адрес по телефону'}</dd>
          <dt>Отмена</dt>
          <dd>Онлайн — не позднее чем за {settings.cancelBeforeHours} ч до начала</dd>
          <dt>Перенос</dt>
          <dd>Онлайн — не позднее чем за {settings.rescheduleBeforeHours} ч до начала</dd>
          <dt>Оплата</dt>
          <dd>В барбершопе</dd>
        </dl>

        {!user ? (
          <div className="alert">
            <span>
              Чтобы подтвердить запись, войдите в аккаунт — выбор сохранится.{' '}
              <Link to="/login?next=/book">Войти</Link> или <Link to="/register?next=/book">зарегистрироваться</Link>.
            </span>
          </div>
        ) : (
          <>
            <div className="form-grid form-grid--2">
              <Field label="Имя">{(p) => <Input {...p} value={[user.name, user.surname].filter(Boolean).join(' ')} disabled />}</Field>
              <Field label="Телефон" error={phoneError} hint="Для связи по записи">
                {(p) => <Input {...p} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
              </Field>
              <Field label="Комментарий для мастера" hint="Необязательно" className="span-2">
                {(p) => <Input {...p} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />}
              </Field>
            </div>
            <Checkbox
              label="Напомнить о записи за 24 и за 2 часа"
              hint={
                user.prefs.channel === 'email'
                  ? `Канал: email${user.email ? ` (${user.email})` : ' — не указан, добавьте в профиле'}. Отправка заработает после подключения сервиса уведомлений.`
                  : 'Канал: Telegram. Отправка заработает после подключения бота.'
              }
              checked={user.prefs.reminders}
              onChange={(e) => void updatePrefs({ reminders: e.target.checked })}
            />
          </>
        )}

        {error && (
          <div className="alert alert--error" role="alert">
            <span>
              {error}{' '}
              {error.includes('занято') && (
                <button className="link-btn" onClick={onSlotLost}>Выбрать другое время</button>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="book__nav">
        <Button variant="ghost" onClick={onBack}>
          <Icon name="chevronLeft" /> Назад
        </Button>
        <Button variant="book" size="lg" disabled={!user} loading={busy} onClick={() => void submit()}>
          Записаться
        </Button>
      </div>
    </section>
  )
}

function BookingSuccess({ appt, onAgain }: { appt: Appointment; onAgain: () => void }) {
  const master = useDb((s) => s.masters.find((m) => m.id === appt.masterId))
  return (
    <div className="container">
      <section className="success" aria-live="polite">
        <p className="muted">Запись создана</p>
        <p className="success__num num">№{appt.number}</p>
        <div><StatusBadge status={appt.status} /></div>
        <p style={{ fontSize: 'var(--fs-lg)' }}>
          {formatDateTime(appt.startsAt)}, мастер {master?.name}.
        </p>
        <p className="muted">Мастер подтвердит запись — статус обновится в профиле.</p>
        <div className="row">
          <Link className="btn btn--primary" to={`/profile/appointments/${appt.id}`}>Открыть запись</Link>
          <Button variant="ghost" onClick={onAgain}>Записаться ещё</Button>
        </div>
      </section>
    </div>
  )
}
