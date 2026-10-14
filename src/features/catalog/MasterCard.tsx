import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '@/data/store'
import { findNextSlot } from '@/domain/slots'
import { formatDateTime, formatRub, WEEK_ORDER, WEEKDAYS_SHORT } from '@/domain/format'
import type { Master } from '@/domain/types'
import { initials } from '@/domain/format'
import './catalog.css'

export function workDaysText(m: Master): string {
  const days = WEEK_ORDER.filter((d) => m.schedule[d])
  if (!days.length) return 'График не указан'
  return days.map((d) => `${WEEKDAYS_SHORT[d]} ${m.schedule[d]!.start}–${m.schedule[d]!.end}`).join(', ')
}

export function MasterCard({ master, withBooking = true }: { master: Master; withBooking?: boolean }) {
  const services = useDb((s) => s.services)
  const appointments = useDb((s) => s.busy)
  const timeOff = useDb((s) => s.timeOff)
  const settings = useDb((s) => s.settings)

  const offered = useMemo(
    () => services.filter((s) => s.active && master.serviceIds.includes(s.id)),
    [services, master.serviceIds],
  )
  const minPrice = offered.length ? Math.min(...offered.map((s) => s.price)) : null
  const shortest = offered.length ? Math.min(...offered.map((s) => s.durationMinutes)) : 0

  const next = useMemo(
    () =>
      shortest
        ? findNextSlot({
            master,
            durationMinutes: shortest,
            appointments,
            timeOff,
            rules: { stepMinutes: settings.slotStepMinutes, minLeadMinutes: settings.minLeadMinutes, horizonDays: settings.horizonDays },
          })
        : null,
    [master, shortest, appointments, timeOff, settings],
  )

  return (
    <article className="master">
      {master.photo ? (
        <img className="master__photo" src={master.photo} alt={master.name} loading="lazy" />
      ) : (
        <div className="master__photo photo-empty" aria-hidden>
          {initials(master.name)}
        </div>
      )}
      <div className="stack" style={{ gap: 'var(--sp-1)' }}>
        <h3 className="master__name">{master.name}</h3>
        {master.specialization && <p className="master__spec">{master.specialization}</p>}
      </div>
      {master.bio && <p className="master__bio">{master.bio}</p>}
      <div className="master__facts">
        <span className="muted">{workDaysText(master)}</span>
        {minPrice !== null && <span>Услуги от {formatRub(minPrice)}</span>}
        <span>
          {next ? (
            <>Ближайшее время: <strong>{formatDateTime(next.startsAt)}</strong></>
          ) : (
            <span className="muted">Свободного времени в ближайшие {settings.horizonDays} дн. нет</span>
          )}
        </span>
      </div>
      {withBooking && offered.length > 0 && (
        <Link className="btn btn--sm" to={`/book?master=${master.id}`} style={{ alignSelf: 'flex-start' }}>
          Записаться к мастеру
        </Link>
      )}
    </article>
  )
}
