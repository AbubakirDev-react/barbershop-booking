import type { Actor, Appointment, AppointmentStatus, ShopSettings } from './types'

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  in_progress: 'Идёт обслуживание',
  completed: 'Завершена',
  cancelled: 'Отменена',
  no_show: 'Клиент не пришёл',
}

/** Статусы, которые занимают слот в расписании */
export const ACTIVE_STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'in_progress']

export const isActive = (s: AppointmentStatus) => ACTIVE_STATUSES.includes(s)

const STAFF_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string }

/**
 * Единственное место, где решается, можно ли перевести запись в новый статус.
 * Клиент может только отменять — и только пока запись не началась и срок не вышел.
 * Истечение времени записи ничего не меняет автоматически (правило плана).
 */
export function canTransition(
  appt: Pick<Appointment, 'status' | 'startsAt'>,
  to: AppointmentStatus,
  actor: Actor,
  settings: Pick<ShopSettings, 'cancelBeforeHours'>,
  now: Date = new Date(),
): TransitionCheck {
  if (!STAFF_TRANSITIONS[appt.status].includes(to)) {
    return { ok: false, reason: 'Из текущего статуса этот переход недоступен' }
  }
  if (actor === 'system') return { ok: false, reason: 'Автоматические переходы не поддерживаются' }
  if (actor === 'client') {
    if (to !== 'cancelled') return { ok: false, reason: 'Клиент может только отменить запись' }
    if (appt.status === 'in_progress') {
      return { ok: false, reason: 'Запись уже начата — отмена возможна через барбершоп' }
    }
    const hoursLeft = (new Date(appt.startsAt).getTime() - now.getTime()) / 3_600_000
    if (hoursLeft < settings.cancelBeforeHours) {
      return {
        ok: false,
        reason: `Отменить онлайн можно не позднее чем за ${settings.cancelBeforeHours} ч до начала. Позвоните в барбершоп`,
      }
    }
  }
  return { ok: true }
}

export function canReschedule(
  appt: Pick<Appointment, 'status' | 'startsAt'>,
  actor: Actor,
  settings: Pick<ShopSettings, 'rescheduleBeforeHours'>,
  now: Date = new Date(),
): TransitionCheck {
  if (appt.status !== 'pending' && appt.status !== 'confirmed') {
    return { ok: false, reason: 'Перенести можно только ожидающую или подтверждённую запись' }
  }
  if (actor === 'client') {
    const hoursLeft = (new Date(appt.startsAt).getTime() - now.getTime()) / 3_600_000
    if (hoursLeft < settings.rescheduleBeforeHours) {
      return {
        ok: false,
        reason: `Перенести онлайн можно не позднее чем за ${settings.rescheduleBeforeHours} ч до начала`,
      }
    }
  }
  return { ok: true }
}
