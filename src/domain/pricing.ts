import type { AppointmentItem, Service } from './types'

export const MAX_SERVICES_PER_APPOINTMENT = 3

export interface Totals {
  total: number
  durationMinutes: number
}

/**
 * Итоги считаются по снимкам позиций. Скидки не применяются: правила скидок
 * владелец пока не задавал, а процент придумывать нельзя.
 * Сумма идёт в копейках, чтобы не накапливать ошибку float.
 */
export function calcTotals(items: Pick<AppointmentItem, 'price' | 'durationMinutes'>[]): Totals {
  const kopecks = items.reduce((acc, i) => acc + Math.round(i.price * 100), 0)
  return {
    total: kopecks / 100,
    durationMinutes: items.reduce((acc, i) => acc + i.durationMinutes, 0),
  }
}

export const toItem = (s: Service): AppointmentItem => ({
  serviceId: s.id,
  serviceName: s.name,
  price: s.price,
  durationMinutes: s.durationMinutes,
})
