import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '@/data/store'
import { useCurrentUser } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { getDaySlots } from '@/domain/slots'
import { formatTime, formatWeekdayDate } from '@/domain/format'
import { dayKey, shopToday } from '@/domain/tz'
import { AppointmentRow } from '@/features/appointments/AppointmentRow'
import { ManualBookingModal } from '@/features/dashboard/ManualBookingModal'
import { useAppointmentModal, useStaffAppointments, useStaffMasters } from '@/features/dashboard/staff'
import { Button, EmptyState, Icon } from '@/shared/ui'

export default function DashboardHome() {
  usePageMeta('Сегодня', '', { noindex: true })
  const user = useCurrentUser()!
  const appointments = useStaffAppointments()
  const masters = useStaffMasters()
  const services = useDb((s) => s.services)
  const allMasters = useDb((s) => s.masters)
  const timeOff = useDb((s) => s.timeOff)
  const settings = useDb((s) => s.settings)
  const { open, modal } = useAppointmentModal()
  const [creating, setCreating] = useState(false)
  const now = new Date()

  const allAppointments = useDb((s) => s.busy)
  const today = appointments
    .filter((a) => dayKey(a.startsAt) === dayKey(now))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const activeToday = today.filter((a) => a.status !== 'cancelled')
  const current = today.find((a) => a.status === 'in_progress')
  const next = today.find((a) => (a.status === 'confirmed' || a.status === 'pending') && new Date(a.startsAt) > now)
  const pending = appointments.filter((a) => a.status === 'pending').sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const cancelledToday = today.filter((a) => a.status === 'cancelled')
  // Требуют внимания: время прошло, а статус не обновлён (автоматически не меняем)
  const attention = appointments.filter(
    (a) =>
      ((a.status === 'pending' || a.status === 'confirmed') && new Date(a.startsAt) < now) ||
      (a.status === 'in_progress' && new Date(a.endsAt).getTime() + 60 * 60_000 < now.getTime()),
  )

  // Свободные окна сегодня: слоты минимальной длины по каждому мастеру
  const freeWindows = useMemo(() => {
    const minDuration = Math.min(...services.filter((s) => s.active).map((s) => s.durationMinutes), 60)
    return masters.map((m) => {
      const slots = getDaySlots({
        master: m,
        day: shopToday(),
        durationMinutes: minDuration,
        appointments: allAppointments,
        timeOff,
        rules: { stepMinutes: settings.slotStepMinutes, minLeadMinutes: 0, horizonDays: settings.horizonDays },
      }).filter((s) => s.available)
      return { master: m, slots }
    })
  }, [masters, services, timeOff, settings, allAppointments])

  const needsSetup = user.role === 'owner' && (services.length === 0 || allMasters.length === 0)

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Сегодня</h1>
          <p className="cap-first">{formatWeekdayDate(now)}</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} disabled={!masters.length}>
          <Icon name="plus" /> Новая запись
        </Button>
      </div>

      {needsSetup && <SetupChecklist />}

      <div className="stat-row">
        <Stat value={activeToday.length} label="Записей сегодня" />
        <Stat value={pending.length} label="Ждут подтверждения" />
        <Stat value={cancelledToday.length} label="Отменено сегодня" />
        <Stat value={attention.length} label="Требуют внимания" />
      </div>

      <div className="grid-2">
        <section className="panel panel--flush" aria-labelledby="today-list">
          <div className="panel__head" style={{ padding: 'var(--sp-4) var(--sp-4) 0' }}>
            <h2 id="today-list">Расписание на сегодня</h2>
            <Link to="/dashboard/calendar" className="section__more">Календарь</Link>
          </div>
          {today.length ? (
            today.map((a) => <AppointmentRow key={a.id} appt={a} onOpen={() => open(a.id)} showClient showDate={false} />)
          ) : (
            <div style={{ padding: 'var(--sp-4)' }}>
              <EmptyState title="На сегодня записей нет" text="Новые онлайн-записи появятся здесь автоматически." />
            </div>
          )}
        </section>

        <div className="stack" style={{ gap: 'var(--sp-5)' }}>
          <section className="panel" aria-labelledby="now">
            <div className="panel__head"><h2 id="now">Сейчас и далее</h2></div>
            <div className="stack" style={{ gap: 'var(--sp-3)' }}>
              <NowLine label="Текущая" appt={current} onOpen={open} empty="Никто не обслуживается" />
              <NowLine label="Следующая" appt={next} onOpen={open} empty="Больше записей сегодня нет" />
            </div>
          </section>

          {attention.length > 0 && (
            <section className="panel" aria-labelledby="attention" style={{ borderColor: 'var(--c-warn)' }}>
              <div className="panel__head"><h2 id="attention">Требуют внимания</h2></div>
              <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-3)' }}>
                Время записи прошло, а статус не обновлён. Отметьте, чем всё закончилось.
              </p>
              <div className="stack" style={{ gap: 'var(--sp-2)' }}>
                {attention.slice(0, 5).map((a) => (
                  <button key={a.id} className="btn btn--sm" style={{ justifyContent: 'space-between' }} onClick={() => open(a.id)}>
                    <span>№{a.number} · {a.clientName}</span>
                    <span className="muted">{formatTime(a.startsAt)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {pending.length > 0 && (
            <section className="panel panel--flush" aria-labelledby="pending">
              <div className="panel__head" style={{ padding: 'var(--sp-4) var(--sp-4) 0' }}>
                <h2 id="pending">Ждут подтверждения</h2>
              </div>
              {pending.slice(0, 5).map((a) => (
                <AppointmentRow key={a.id} appt={a} onOpen={() => open(a.id)} showClient />
              ))}
            </section>
          )}

          <section className="panel" aria-labelledby="free">
            <div className="panel__head"><h2 id="free">Свободные окна сегодня</h2></div>
            {freeWindows.length === 0 ? (
              <p className="muted">Нет активных мастеров.</p>
            ) : (
              <div className="stack" style={{ gap: 'var(--sp-3)' }}>
                {freeWindows.map(({ master, slots }) => (
                  <div key={master.id}>
                    <p style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{master.name}</p>
                    <p className="muted num" style={{ fontSize: 'var(--fs-sm)' }}>
                      {slots.length ? slots.map((s) => formatTime(s.startsAt)).join(', ') : 'Свободного времени нет'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {modal}
      {creating && <ManualBookingModal onClose={() => setCreating(false)} />}
    </>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  )
}

function NowLine({
  label,
  appt,
  onOpen,
  empty,
}: {
  label: string
  appt: ReturnType<typeof useStaffAppointments>[number] | undefined
  onOpen: (id: string) => void
  empty: string
}) {
  return (
    <div className="spread">
      <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{label}</span>
      {appt ? (
        <button className="btn btn--sm" onClick={() => onOpen(appt.id)}>
          {formatTime(appt.startsAt)} · {appt.clientName}
        </button>
      ) : (
        <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{empty}</span>
      )}
    </div>
  )
}

function SetupChecklist() {
  const s = useDb((st) => st)
  const steps = [
    { done: !!s.settings.name && !!s.settings.address, label: 'Указать название, адрес и телефон', to: '/dashboard/settings' },
    { done: s.services.length > 0, label: 'Добавить услуги с ценами', to: '/dashboard/services' },
    { done: s.masters.length > 0, label: 'Добавить мастеров и их расписание', to: '/dashboard/masters' },
  ]
  return (
    <section className="panel" aria-labelledby="setup" style={{ borderColor: 'var(--c-steel)' }}>
      <div className="panel__head"><h2 id="setup">Подготовка к открытию записи</h2></div>
      <ol style={{ margin: 0, paddingLeft: '1.2em', display: 'grid', gap: 'var(--sp-2)' }}>
        {steps.map((st) => (
          <li key={st.label}>
            <Link to={st.to} style={{ textDecoration: st.done ? 'line-through' : undefined, color: st.done ? 'var(--c-muted)' : undefined }}>
              {st.label}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
