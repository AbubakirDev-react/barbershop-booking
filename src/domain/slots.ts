import { addDays, addMinutes, startOfDay } from 'date-fns'
import { isActive } from './statuses'
import type { Appointment, Master, ShopSettings, TimeOff } from './types'
import { dayKey, inShopTz } from './tz'

export interface Slot {
  /** ISO начала */
  startsAt: string
  endsAt: string
  available: boolean
  /** Почему слот недоступен — для подсказки в интерфейсе */
  reason?: 'busy' | 'past' | 'break'
}

export interface SlotRules {
  stepMinutes: ShopSettings['slotStepMinutes']
  minLeadMinutes: number
  horizonDays: number
}

export interface SlotInput {
  master: Pick<Master, 'id' | 'schedule' | 'active'>
  day: Date
  durationMinutes: number
  appointments: Pick<Appointment, 'id' | 'masterId' | 'startsAt' | 'endsAt' | 'status'>[]
  timeOff: TimeOff[]
  rules: SlotRules
  now?: Date
  /** Запись, которую переносим: её время не считается занятым */
  ignoreAppointmentId?: string
}

export function parseHm(hm: string, day: Date): Date {
  const [h, m] = hm.split(':').map(Number)
  const d = startOfDay(day)
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd

export function isDayOff(masterId: string, day: Date, timeOff: TimeOff[]): boolean {
  const key = dayKey(day)
  return timeOff.some((t) => (t.masterId === null || t.masterId === masterId) && t.from <= key && key <= t.to)
}

/**
 * Все слоты мастера на день. Слот доступен, если помещается целиком в рабочий
 * интервал, не пересекает перерыв и активные записи, не раньше минимального
 * времени до записи и не дальше горизонта. Эта же функция должна быть
 * продублирована на сервере (RPC + exclusion constraint) — UI ей не доверяет.
 */
export function getDaySlots(input: SlotInput): Slot[] {
  const { master, durationMinutes, appointments, timeOff, rules, ignoreAppointmentId } = input
  const now = input.now ?? new Date()
  // День и часы работы — в поясе барбершопа, независимо от пояса устройства
  const day = startOfDay(inShopTz(input.day))

  if (!master.active || durationMinutes <= 0) return []
  const hours = master.schedule[day.getDay()]
  if (!hours || isDayOff(master.id, day, timeOff)) return []

  const horizonEnd = addDays(startOfDay(inShopTz(now)), rules.horizonDays + 1)
  if (day >= horizonEnd) return []

  const earliest = addMinutes(now, rules.minLeadMinutes)
  const dayEnd = parseHm(hours.end, day)
  const breaks = hours.breaks.map((b) => [parseHm(b.start, day), parseHm(b.end, day)] as const)
  const busy = appointments
    .filter((a) => a.masterId === master.id && isActive(a.status) && a.id !== ignoreAppointmentId)
    .map((a) => [new Date(a.startsAt), new Date(a.endsAt)] as const)

  const slots: Slot[] = []
  for (let start = parseHm(hours.start, day); ; start = addMinutes(start, rules.stepMinutes)) {
    const end = addMinutes(start, durationMinutes)
    if (end > dayEnd) break

    let reason: Slot['reason']
    if (start < earliest) reason = 'past'
    else if (breaks.some(([bs, be]) => overlaps(start, end, bs, be))) reason = 'break'
    else if (busy.some(([bs, be]) => overlaps(start, end, bs, be))) reason = 'busy'

    slots.push({
      // TZDate.toISOString() даёт смещение (+03:00); приводим к UTC 'Z',
      // чтобы время слота совпадало со временем записей с сервера
      startsAt: new Date(start.getTime()).toISOString(),
      endsAt: new Date(end.getTime()).toISOString(),
      available: reason === undefined,
      reason,
    })
  }
  return slots
}

/** Ближайший свободный слот в пределах горизонта записи, либо null */
export function findNextSlot(
  input: Omit<SlotInput, 'day'>,
): Slot | null {
  const now = input.now ?? new Date()
  for (let i = 0; i <= input.rules.horizonDays; i++) {
    const free = getDaySlots({ ...input, day: addDays(startOfDay(inShopTz(now)), i) }).find((s) => s.available)
    if (free) return free
  }
  return null
}

export type DayPart = 'morning' | 'day' | 'evening'

export const DAY_PART_LABEL: Record<DayPart, string> = {
  morning: 'Утро',
  day: 'День',
  evening: 'Вечер',
}

export function dayPartOf(iso: string): DayPart {
  const h = inShopTz(iso).getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'day'
  return 'evening'
}
