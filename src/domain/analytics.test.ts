import { beforeAll, describe, expect, it } from 'vitest'
import { setShopTimezone } from './tz'
import { computeAnalytics, previousPeriod } from './analytics'
import type { Appointment, AppointmentStatus } from './types'


// Эти тесты описывают даты во времени устройства, поэтому пояс магазина = пояс устройства
beforeAll(() => setShopTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone))
const make = (id: string, status: AppointmentStatus, total: number, day = 10): Appointment => ({
  id,
  number: 1,
  requestId: id,
  clientUserId: null,
  clientName: 'Тест',
  clientPhone: '',
  masterId: 'm1',
  startsAt: new Date(2030, 0, day, 12).toISOString(),
  endsAt: new Date(2030, 0, day, 13).toISOString(),
  status,
  source: 'manual',
  note: '',
  items: [
    { serviceId: 's1', serviceName: 'Стрижка', price: total - 500, durationMinutes: 30 },
    { serviceId: 's2', serviceName: 'Борода', price: 500, durationMinutes: 30 },
  ],
  total,
  durationMinutes: 60,
  createdAt: '',
  history: [],
})

const period = { from: new Date(2030, 0, 1), to: new Date(2030, 0, 31) }

describe('computeAnalytics', () => {
  it('считает выручку только по завершённым и не задваивает комплекс', () => {
    const r = computeAnalytics(
      [make('a', 'completed', 1500), make('b', 'completed', 1000), make('c', 'cancelled', 900), make('d', 'no_show', 900), make('e', 'pending', 900)],
      [],
      [],
      period,
    )
    expect(r.completed).toBe(2)
    expect(r.revenue).toBe(2500)
    expect(r.averageCheck).toBe(1250)
    expect(r.cancelled).toBe(1)
    expect(r.noShow).toBe(1)
  })

  it('не включает записи вне периода', () => {
    const r = computeAnalytics([make('a', 'completed', 1500, 10)], [], [], { from: new Date(2030, 0, 11), to: new Date(2030, 0, 20) })
    expect(r.completed).toBe(0)
    expect(r.revenue).toBe(0)
  })

  it('популярные услуги считаются по выполненным', () => {
    const r = computeAnalytics([make('a', 'completed', 1500), make('b', 'cancelled', 1500)], [], [], period)
    expect(r.services.map((s) => s.name).sort()).toEqual(['Борода', 'Стрижка'])
    expect(r.services[0]!.count).toBe(1)
  })

  it('предыдущий период имеет ту же длину', () => {
    const prev = previousPeriod({ from: new Date(2030, 0, 8), to: new Date(2030, 0, 14) })
    expect(prev.from.getDate()).toBe(1)
    expect(prev.to.getDate()).toBe(7)
  })
})
