import { addDays, differenceInCalendarDays, eachDayOfInterval, format, startOfDay } from 'date-fns'
import { parseHm } from './slots'
import { dayKey, inShopTz } from './tz'
import type { Appointment, Master, TimeOff } from './types'

export interface Period {
  from: Date
  /** Включительно */
  to: Date
}

export interface ServiceStat {
  serviceId: string
  name: string
  count: number
  revenue: number
}

export interface MasterLoad {
  masterId: string
  name: string
  bookedMinutes: number
  availableMinutes: number
  /** 0..1, null — если у мастера нет рабочих часов в периоде */
  load: number | null
}

export interface Analytics {
  completed: number
  revenue: number
  averageCheck: number
  cancelled: number
  noShow: number
  services: ServiceStat[]
  masterLoad: MasterLoad[]
  byDay: { day: string; revenue: number; count: number }[]
}

const inPeriod = (iso: string, p: Period) => {
  const t = new Date(iso).getTime()
  return t >= startOfDay(inShopTz(p.from)).getTime() && t < startOfDay(addDays(inShopTz(p.to), 1)).getTime()
}

const toKopecks = (n: number) => Math.round(n * 100)

/**
 * Выручка считается только по завершённым записям. Итог записи берётся один
 * раз из `total` — не суммируется по услугам повторно, поэтому комплексы
 * из нескольких услуг не задваиваются. Отменённые и неявки в выручку не входят.
 */
export function computeAnalytics(
  appointments: Appointment[],
  masters: Master[],
  timeOff: TimeOff[],
  period: Period,
  masterId?: string,
): Analytics {
  const list = appointments.filter((a) => inPeriod(a.startsAt, period) && (!masterId || a.masterId === masterId))
  const done = list.filter((a) => a.status === 'completed')

  const kopecks = done.reduce((acc, a) => acc + toKopecks(a.total), 0)

  const svc = new Map<string, ServiceStat>()
  for (const a of done) {
    for (const i of a.items) {
      const s = svc.get(i.serviceId) ?? { serviceId: i.serviceId, name: i.serviceName, count: 0, revenue: 0 }
      s.count++
      s.revenue = (toKopecks(s.revenue) + toKopecks(i.price)) / 100
      svc.set(i.serviceId, s)
    }
  }

  const days = eachDayOfInterval({ start: startOfDay(inShopTz(period.from)), end: startOfDay(inShopTz(period.to)) })
  const byDay = days.map((d) => {
    const key = format(d, 'yyyy-MM-dd')
    const items = done.filter((a) => dayKey(a.startsAt) === key)
    return { day: key, revenue: items.reduce((acc, a) => acc + toKopecks(a.total), 0) / 100, count: items.length }
  })

  // Загрузка: занятые минуты (подтверждённые, идущие и завершённые) / рабочие минуты за вычетом перерывов и отпусков
  const relevant = masters.filter((m) => !masterId || m.id === masterId)
  const masterLoad = relevant.map((m) => {
    let available = 0
    for (const d of days) {
      const hours = m.schedule[d.getDay()]
      const key = format(d, 'yyyy-MM-dd')
      const off = timeOff.some((t) => (t.masterId === null || t.masterId === m.id) && t.from <= key && key <= t.to)
      if (!hours || off) continue
      const work = (parseHm(hours.end, d).getTime() - parseHm(hours.start, d).getTime()) / 60_000
      const breaks = hours.breaks.reduce((acc, b) => acc + (parseHm(b.end, d).getTime() - parseHm(b.start, d).getTime()) / 60_000, 0)
      available += Math.max(0, work - breaks)
    }
    const booked = list
      .filter((a) => a.masterId === m.id && (a.status === 'completed' || a.status === 'in_progress' || a.status === 'confirmed'))
      .reduce((acc, a) => acc + a.durationMinutes, 0)
    return { masterId: m.id, name: m.name, bookedMinutes: booked, availableMinutes: available, load: available > 0 ? Math.min(1, booked / available) : null }
  })

  return {
    completed: done.length,
    revenue: kopecks / 100,
    averageCheck: done.length ? Math.round(kopecks / done.length) / 100 : 0,
    cancelled: list.filter((a) => a.status === 'cancelled').length,
    noShow: list.filter((a) => a.status === 'no_show').length,
    services: [...svc.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue),
    masterLoad,
    byDay,
  }
}

/** Предыдущий период той же длины — для сравнения динамики */
export function previousPeriod(p: Period): Period {
  const len = differenceInCalendarDays(p.to, p.from) + 1
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) }
}
