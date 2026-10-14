import { afterAll, describe, expect, it } from 'vitest'
import { getDaySlots } from './slots'
import { dayKey, fromDayKey, setShopTimezone } from './tz'
import { formatTime } from './format'
import type { Master } from './types'

const master: Pick<Master, 'id' | 'schedule' | 'active'> = {
  id: 'm1',
  active: true,
  schedule: Array.from({ length: 7 }, () => ({ start: '10:00', end: '12:00', breaks: [] })),
}
const rules = { stepMinutes: 60, minLeadMinutes: 0, horizonDays: 30 }

afterAll(() => setShopTimezone('Europe/Moscow'))

describe('часовой пояс барбершопа', () => {
  it('рабочие часы считаются в поясе барбершопа, а не устройства', () => {
    setShopTimezone('Asia/Vladivostok') // UTC+10
    const day = fromDayKey('2030-01-07')
    const now = new Date('2030-01-01T00:00:00Z')
    const slots = getDaySlots({ master, day, durationMinutes: 60, appointments: [], timeOff: [], rules, now })
    // 10:00 во Владивостоке = 00:00 UTC
    expect(slots.map((s) => s.startsAt)).toEqual(['2030-01-07T00:00:00.000Z', '2030-01-07T01:00:00.000Z'])
    expect(slots.map((s) => formatTime(s.startsAt))).toEqual(['10:00', '11:00'])
  })

  it('та же настройка для Москвы даёт другое время UTC', () => {
    setShopTimezone('Europe/Moscow') // UTC+3
    const slots = getDaySlots({ master, day: fromDayKey('2030-01-07'), durationMinutes: 60, appointments: [], timeOff: [], rules, now: new Date('2030-01-01T00:00:00Z') })
    expect(slots[0]!.startsAt).toBe('2030-01-07T07:00:00.000Z')
  })

  it('календарная дата берётся в поясе барбершопа', () => {
    setShopTimezone('Asia/Vladivostok')
    // 20:00 UTC 7 января — во Владивостоке уже 8 января
    expect(dayKey('2030-01-07T20:00:00Z')).toBe('2030-01-08')
  })
})
