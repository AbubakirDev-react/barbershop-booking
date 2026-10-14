import { useMemo } from 'react'
import { useDb } from '@/data/store'
import { WEEK_ORDER, WEEKDAYS_FULL } from '@/domain/format'

/**
 * Часы работы барбершопа выводятся из расписаний активных мастеров:
 * самое раннее начало и самый поздний конец по каждому дню недели.
 * Если владелец написал свой текст — показываем его.
 */
export function ShopHours() {
  const masters = useDb((s) => s.masters)
  const note = useDb((s) => s.settings.hoursNote)

  const rows = useMemo(() => {
    const active = masters.filter((m) => m.active)
    return WEEK_ORDER.map((d) => {
      const days = active.map((m) => m.schedule[d]).filter((x) => x !== null && x !== undefined)
      if (!days.length) return { d, text: 'Выходной' }
      const start = days.map((x) => x.start).sort()[0]
      const end = days.map((x) => x.end).sort().at(-1)
      return { d, text: `${start}–${end}` }
    })
  }, [masters])

  if (note) return <p style={{ whiteSpace: 'pre-line' }}>{note}</p>
  if (!masters.some((m) => m.active && m.schedule.some(Boolean))) {
    return <p className="muted">График работы пока не опубликован.</p>
  }
  const today = new Date().getDay()
  return (
    <table className="hours">
      <caption className="visually-hidden">Часы работы</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.d} className={r.d === today ? 'today' : undefined}>
            <td>{WEEKDAYS_FULL[r.d]}</td>
            <td>{r.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
