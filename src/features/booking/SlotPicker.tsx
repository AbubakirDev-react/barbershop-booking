import { useMemo, useState } from 'react'
import { addDays, format, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useDb } from '@/data/store'
import { DAY_PART_LABEL, dayPartOf, getDaySlots, type DayPart, type Slot } from '@/domain/slots'
import { formatTime, formatWeekdayDate } from '@/domain/format'
import { dayKey, inShopTz, shopToday } from '@/domain/tz'
import type { Master } from '@/domain/types'
import { EmptyState } from '@/shared/ui'
import './booking.css'

interface Props {
  master: Master
  durationMinutes: number
  value: string | null
  onChange: (startsAt: string | null) => void
  ignoreAppointmentId?: string
  /** Барбер может записывать без минимального запаса времени */
  staffMode?: boolean
}

/**
 * Выбор даты и точного времени. Слоты считаются той же функцией, что и
 * проверка при создании записи, поэтому UI и проверка не расходятся.
 * Разбивка утро/день/вечер — лишь фильтр поверх точных слотов.
 */
export function SlotPicker({ master, durationMinutes, value, onChange, ignoreAppointmentId, staffMode }: Props) {
  const appointments = useDb((s) => s.busy)
  const timeOff = useDb((s) => s.timeOff)
  const settings = useDb((s) => s.settings)

  const rules = useMemo(
    () => ({
      stepMinutes: settings.slotStepMinutes,
      minLeadMinutes: staffMode ? 0 : settings.minLeadMinutes,
      horizonDays: settings.horizonDays,
    }),
    [settings, staffMode],
  )

  const days = useMemo(() => {
    const today = shopToday()
    return Array.from({ length: settings.horizonDays + 1 }, (_, i) => {
      const day = addDays(today, i)
      const slots = getDaySlots({ master, day, durationMinutes, appointments, timeOff, rules, ignoreAppointmentId })
      return { day, slots, free: slots.filter((s) => s.available).length }
    })
  }, [master, durationMinutes, appointments, timeOff, rules, ignoreAppointmentId, settings.horizonDays])

  const firstFree = days.find((d) => d.free > 0)
  const [selectedDay, setSelectedDay] = useState<Date | null>(() =>
    value ? startOfDay(inShopTz(value)) : (firstFree?.day ?? null),
  )
  const [part, setPart] = useState<DayPart | 'all'>('all')

  const current = days.find((d) => selectedDay && dayKey(d.day) === dayKey(selectedDay))
  const parts = useMemo(() => {
    const set = new Set((current?.slots ?? []).map((s) => dayPartOf(s.startsAt)))
    return (['morning', 'day', 'evening'] as DayPart[]).filter((p) => set.has(p))
  }, [current])
  const shown = (current?.slots ?? []).filter((s) => part === 'all' || dayPartOf(s.startsAt) === part)

  if (!firstFree) {
    return (
      <EmptyState
        title="Свободного времени нет"
        text={`У мастера нет свободных окон на ближайшие ${settings.horizonDays} дн. для выбранных услуг. Попробуйте другого мастера или меньше услуг.`}
      />
    )
  }

  return (
    <div className="slot-picker">
      <div className="date-strip" role="listbox" aria-label="Дата">
        {days.map(({ day, free, slots }) => {
          const selected = !!selectedDay && dayKey(day) === dayKey(selectedDay)
          const off = slots.length === 0
          return (
            <button
              key={day.toISOString()}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={free === 0}
              className="date-strip__day"
              onClick={() => {
                setSelectedDay(day)
                setPart('all')
                onChange(null)
              }}
              title={off ? 'Выходной' : free === 0 ? 'Всё занято' : `${free} свободных`}
            >
              <span className="date-strip__wd">{format(day, 'EEEEEE', { locale: ru })}</span>
              <span className="date-strip__num">{format(day, 'd')}</span>
              <span className="date-strip__mon">{format(day, 'LLL', { locale: ru })}</span>
            </button>
          )
        })}
      </div>

      {current && (
        <div className="stack" style={{ gap: 'var(--sp-3)' }}>
          <div className="spread">
            <h3 className="cap-first" style={{ fontSize: 'var(--fs-md)' }}>{formatWeekdayDate(current.day)}</h3>
            {parts.length > 1 && (
              <div className="segmented" aria-label="Часть дня">
                <button type="button" aria-pressed={part === 'all'} onClick={() => setPart('all')}>Все</button>
                {parts.map((p) => (
                  <button key={p} type="button" aria-pressed={part === p} onClick={() => setPart(p)}>
                    {DAY_PART_LABEL[p]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="slots" role="radiogroup" aria-label="Время">
            {shown.map((s) => (
              <SlotButton key={s.startsAt} slot={s} selected={value === s.startsAt} onSelect={() => onChange(s.startsAt)} />
            ))}
          </div>
          <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
            Зачёркнутое время занято или недоступно.
          </p>
        </div>
      )}
    </div>
  )
}

const REASON: Record<NonNullable<Slot['reason']>, string> = {
  busy: 'занято',
  past: 'слишком скоро',
  break: 'перерыв',
}

function SlotButton({ slot, selected, onSelect }: { slot: Slot; selected: boolean; onSelect: () => void }) {
  const label = formatTime(slot.startsAt)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={!slot.available}
      className="slot"
      onClick={onSelect}
      aria-label={slot.available ? label : `${label}, ${REASON[slot.reason!]}`}
    >
      {label}
    </button>
  )
}
