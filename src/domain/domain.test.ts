import { beforeAll, describe, expect, it } from 'vitest'
import { setShopTimezone } from './tz'
import { canReschedule, canTransition } from './statuses'
import { getDaySlots, findNextSlot, type SlotRules } from './slots'
import { calcTotals } from './pricing'
import type { Master } from './types'


// Эти тесты описывают даты во времени устройства, поэтому пояс магазина = пояс устройства
beforeAll(() => setShopTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone))
// Понедельник 2030-01-07, чтобы тесты не зависели от текущей даты
const MONDAY = new Date(2030, 0, 7)
const NOW = new Date(2030, 0, 6, 9, 0)

const master: Pick<Master, 'id' | 'schedule' | 'active'> = {
  id: 'm1',
  active: true,
  schedule: [
    null,
    { start: '10:00', end: '14:00', breaks: [{ start: '12:00', end: '12:30' }] },
    null,
    null,
    null,
    null,
    null,
  ],
}
const rules: SlotRules = { stepMinutes: 30, minLeadMinutes: 60, horizonDays: 30 }

describe('getDaySlots', () => {
  it('не создаёт слотов в выходной', () => {
    const tuesday = new Date(2030, 0, 8)
    expect(getDaySlots({ master, day: tuesday, durationMinutes: 30, appointments: [], timeOff: [], rules, now: NOW })).toEqual([])
  })

  it('слот должен помещаться до конца рабочего дня', () => {
    const slots = getDaySlots({ master, day: MONDAY, durationMinutes: 60, appointments: [], timeOff: [], rules, now: NOW })
    const last = slots[slots.length - 1]!
    expect(new Date(last.endsAt).getHours()).toBe(14)
  })

  it('перерыв блокирует пересекающиеся слоты', () => {
    const slots = getDaySlots({ master, day: MONDAY, durationMinutes: 60, appointments: [], timeOff: [], rules, now: NOW })
    const at1130 = slots.find((s) => new Date(s.startsAt).getHours() === 11 && new Date(s.startsAt).getMinutes() === 30)!
    expect(at1130.available).toBe(false)
    expect(at1130.reason).toBe('break')
  })

  it('активная запись занимает время, а отменённая — нет', () => {
    const base = { id: 'a1', masterId: 'm1', startsAt: new Date(2030, 0, 7, 10, 0).toISOString(), endsAt: new Date(2030, 0, 7, 11, 0).toISOString() }
    const busy = getDaySlots({ master, day: MONDAY, durationMinutes: 30, appointments: [{ ...base, status: 'confirmed' }], timeOff: [], rules, now: NOW })
    expect(busy[0]!.available).toBe(false)
    const freed = getDaySlots({ master, day: MONDAY, durationMinutes: 30, appointments: [{ ...base, status: 'cancelled' }], timeOff: [], rules, now: NOW })
    expect(freed[0]!.available).toBe(true)
  })

  it('учитывает минимальное время до записи', () => {
    const now = new Date(2030, 0, 7, 10, 0)
    const slots = getDaySlots({ master, day: MONDAY, durationMinutes: 30, appointments: [], timeOff: [], rules, now })
    expect(slots.find((s) => new Date(s.startsAt).getHours() === 10 && new Date(s.startsAt).getMinutes() === 30)!.reason).toBe('past')
    expect(slots.find((s) => new Date(s.startsAt).getHours() === 11 && new Date(s.startsAt).getMinutes() === 0)!.available).toBe(true)
  })

  it('отпуск закрывает день', () => {
    const timeOff = [{ id: 't', masterId: 'm1', from: '2030-01-07', to: '2030-01-07', reason: '' }]
    expect(getDaySlots({ master, day: MONDAY, durationMinutes: 30, appointments: [], timeOff, rules, now: NOW })).toEqual([])
  })

  it('findNextSlot находит ближайший день', () => {
    const next = findNextSlot({ master, durationMinutes: 30, appointments: [], timeOff: [], rules, now: NOW })
    expect(next).not.toBeNull()
    expect(new Date(next!.startsAt).getDay()).toBe(1)
  })
})

describe('calcTotals', () => {
  it('суммирует без ошибок округления', () => {
    expect(calcTotals([{ price: 0.1, durationMinutes: 10 }, { price: 0.2, durationMinutes: 20 }])).toEqual({ total: 0.3, durationMinutes: 30 })
  })
})

describe('переходы статусов', () => {
  const settings = { cancelBeforeHours: 2, rescheduleBeforeHours: 2 }
  const now = new Date(2030, 0, 7, 10, 0)
  const soon = new Date(2030, 0, 7, 11, 0).toISOString()
  const later = new Date(2030, 0, 8, 11, 0).toISOString()

  it('клиент не может завершить запись', () => {
    expect(canTransition({ status: 'in_progress', startsAt: later }, 'completed', 'client', settings, now).ok).toBe(false)
  })
  it('клиент может отменить заранее', () => {
    expect(canTransition({ status: 'pending', startsAt: later }, 'cancelled', 'client', settings, now).ok).toBe(true)
  })
  it('клиент не может отменить слишком поздно', () => {
    expect(canTransition({ status: 'confirmed', startsAt: soon }, 'cancelled', 'client', settings, now).ok).toBe(false)
  })
  it('барбер проводит запись по основному потоку', () => {
    expect(canTransition({ status: 'pending', startsAt: later }, 'confirmed', 'barber', settings, now).ok).toBe(true)
    expect(canTransition({ status: 'confirmed', startsAt: later }, 'in_progress', 'barber', settings, now).ok).toBe(true)
    expect(canTransition({ status: 'in_progress', startsAt: later }, 'completed', 'barber', settings, now).ok).toBe(true)
  })
  it('из финальных статусов выхода нет', () => {
    expect(canTransition({ status: 'completed', startsAt: later }, 'cancelled', 'owner', settings, now).ok).toBe(false)
    expect(canTransition({ status: 'no_show', startsAt: later }, 'confirmed', 'owner', settings, now).ok).toBe(false)
  })
  it('перенос недоступен для завершённой записи', () => {
    expect(canReschedule({ status: 'completed', startsAt: later }, 'barber', settings, now).ok).toBe(false)
  })
})
