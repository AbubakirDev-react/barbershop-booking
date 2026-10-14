import { useMemo, useState } from 'react'
import { addDays, format, startOfDay, startOfWeek } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useDb } from '@/data/store'
import { usePageMeta } from '@/shared/seo'
import { parseHm } from '@/domain/slots'
import { formatTime } from '@/domain/format'
import { dayKey, inShopTz, shopToday } from '@/domain/tz'
import type { Appointment, Master } from '@/domain/types'
import { ManualBookingModal } from '@/features/dashboard/ManualBookingModal'
import { useAppointmentModal, useStaffAppointments, useStaffMasters } from '@/features/dashboard/staff'
import { Button, EmptyState, Icon } from '@/shared/ui'
import './calendar.css'

type View = 'day' | 'week'
const HOUR_PX = 56

/**
 * Календарь. День — колонки по мастерам; неделя — колонки по дням для
 * выбранного мастера. Сетка строится по фактическому расписанию,
 * а не по фиксированным 9–21, чтобы не обманывать пустыми часами.
 */
export default function CalendarPage() {
  usePageMeta('Календарь', '', { noindex: true })
  const masters = useStaffMasters()
  const appointments = useStaffAppointments()
  const { open, modal } = useAppointmentModal()
  const [view, setView] = useState<View>('day')
  const [anchor, setAnchor] = useState<Date>(() => shopToday())
  const [masterId, setMasterId] = useState<string>(masters[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)

  const days = useMemo(
    () => (view === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, { weekStartsOn: 1 }), i))),
    [view, anchor],
  )
  const weekMaster = masters.find((m) => m.id === masterId) ?? masters[0]

  const columns = useMemo<{ key: string; title: string; day: Date; master: Master }[]>(
    () =>
      view === 'day'
        ? masters.map((m) => ({ key: m.id, title: m.name, day: anchor, master: m }))
        : weekMaster
          ? days.map((d) => ({ key: d.toISOString(), title: format(d, 'EEEEEE, d MMM', { locale: ru }), day: d, master: weekMaster }))
          : [],
    [view, masters, anchor, weekMaster, days],
  )

  // Границы сетки: от самого раннего начала до самого позднего конца среди колонок
  const [startHour, endHour] = useMemo(() => {
    let min = 24
    let max = 0
    for (const c of columns) {
      const h = c.master.schedule[c.day.getDay()]
      if (h) {
        min = Math.min(min, Number(h.start.slice(0, 2)))
        max = Math.max(max, Math.ceil(Number(h.end.slice(0, 2)) + Number(h.end.slice(3)) / 60))
      }
    }
    for (const a of appointments) {
      if (columns.some((c) => dayKey(a.startsAt) === dayKey(c.day))) {
        min = Math.min(min, inShopTz(a.startsAt).getHours())
        max = Math.max(max, inShopTz(a.endsAt).getHours() + 1)
      }
    }
    return min >= max ? [9, 21] : [min, max]
  }, [columns, appointments])

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const shift = (dir: number) => setAnchor((d) => addDays(d, dir * (view === 'day' ? 1 : 7)))

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Календарь</h1>
          <p className="cap-first">
            {view === 'day'
              ? format(anchor, 'EEEE, d MMMM yyyy', { locale: ru })
              : `${format(days[0]!, 'd MMM', { locale: ru })} – ${format(days[6]!, 'd MMM yyyy', { locale: ru })}`}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} disabled={!masters.length}>
          <Icon name="plus" /> Новая запись
        </Button>
      </div>

      <div className="toolbar">
        <div className="row" style={{ gap: 'var(--sp-1)' }}>
          <Button icon size="sm" onClick={() => shift(-1)} aria-label="Назад"><Icon name="chevronLeft" /></Button>
          <Button size="sm" onClick={() => setAnchor(shopToday())}>Сегодня</Button>
          <Button icon size="sm" onClick={() => shift(1)} aria-label="Вперёд"><Icon name="chevronRight" /></Button>
        </div>
        <div className="segmented" aria-label="Вид">
          <button aria-pressed={view === 'day'} onClick={() => setView('day')}>День</button>
          <button aria-pressed={view === 'week'} onClick={() => setView('week')}>Неделя</button>
        </div>
        {view === 'week' && masters.length > 1 && (
          <select className="select" style={{ width: 'auto', minHeight: 34 }} value={weekMaster?.id} onChange={(e) => setMasterId(e.target.value)} aria-label="Мастер">
            {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <label className="check" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          Показывать отменённые
        </label>
      </div>

      {columns.length === 0 ? (
        <EmptyState title="Нет активных мастеров" text="Добавьте мастера и его расписание, чтобы увидеть календарь." />
      ) : (
        <div className="cal" style={{ ['--cols' as string]: columns.length }}>
          <div className="cal__head">
            <div className="cal__corner" />
            {columns.map((c) => (
              <div key={c.key} className={`cal__col-title${dayKey(c.day) === dayKey(new Date()) && view === 'week' ? ' is-today' : ''}`}>{c.title}</div>
            ))}
          </div>
          <div className="cal__body" style={{ height: hours.length * HOUR_PX }}>
            <div className="cal__hours">
              {hours.map((h) => (
                <div key={h} className="cal__hour" style={{ height: HOUR_PX }}>{String(h).padStart(2, '0')}:00</div>
              ))}
            </div>
            {columns.map((c) => (
              <Column
                key={c.key}
                day={c.day}
                master={c.master}
                startHour={startHour}
                appointments={appointments.filter(
                  (a) => a.masterId === c.master.id && dayKey(a.startsAt) === dayKey(c.day) && (showCancelled || a.status !== 'cancelled'),
                )}
                onOpen={open}
              />
            ))}
          </div>
        </div>
      )}
      {modal}
      {creating && <ManualBookingModal onClose={() => setCreating(false)} />}
    </>
  )
}

function Column({
  day,
  master,
  startHour,
  appointments,
  onOpen,
}: {
  day: Date
  master: Master
  startHour: number
  appointments: Appointment[]
  onOpen: (id: string) => void
}) {
  const timeOff = useDb((s) => s.timeOff)
  const hours = master.schedule[day.getDay()]
  const key = dayKey(day)
  const off = timeOff.some((t) => (t.masterId === null || t.masterId === master.id) && t.from <= key && key <= t.to)
  const base = startOfDay(inShopTz(day))
  base.setHours(startHour)
  const top = (d: Date) => ((d.getTime() - base.getTime()) / 3_600_000) * HOUR_PX

  return (
    <div className="cal__col">
      {(!hours || off) && <div className="cal__off">{off ? 'Отпуск / выходной' : 'Не работает'}</div>}
      {hours && !off && (
        <>
          <div className="cal__work" style={{ top: top(parseHm(hours.start, day)), height: top(parseHm(hours.end, day)) - top(parseHm(hours.start, day)) }} />
          {hours.breaks.map((b) => (
            <div key={b.start} className="cal__break" style={{ top: top(parseHm(b.start, day)), height: top(parseHm(b.end, day)) - top(parseHm(b.start, day)) }}>
              Перерыв
            </div>
          ))}
        </>
      )}
      {appointments.map((a) => {
        const t = top(new Date(a.startsAt))
        const h = Math.max(top(new Date(a.endsAt)) - t, 26)
        return (
          <button key={a.id} className={`cal__event cal__event--${a.status}`} style={{ top: t, height: h }} onClick={() => onOpen(a.id)}>
            <strong className="num">{formatTime(a.startsAt)}</strong> {a.clientName}
            {h > 40 && <span className="cal__event-sub">{a.items.map((i) => i.serviceName).join(', ')}</span>}
          </button>
        )
      })}
      {dayKey(day) === dayKey(new Date()) && <NowLine top={top(new Date())} />}
    </div>
  )
}

function NowLine({ top }: { top: number }) {
  if (top < 0) return null
  return <div className="cal__now" style={{ top }} aria-hidden />
}
