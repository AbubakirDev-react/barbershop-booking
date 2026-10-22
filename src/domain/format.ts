import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { inShopTz } from './tz'

const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export const formatRub = (value: number) => rub.format(value)

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h} ч ${m} мин`
  if (h) return `${h} ч`
  return `${m} мин`
}

export const formatDate = (iso: string | Date) => format(inShopTz(iso), 'd MMMM yyyy', { locale: ru })
export const formatDayMonth = (iso: string | Date) => format(inShopTz(iso), 'd MMMM', { locale: ru })
export const formatWeekdayDate = (iso: string | Date) =>
  format(inShopTz(iso), 'EEEE, d MMMM', { locale: ru })
export const formatTime = (iso: string | Date) => format(inShopTz(iso), 'HH:mm')
export const formatDateTime = (iso: string | Date) =>
  format(inShopTz(iso), 'd MMMM yyyy, HH:mm', { locale: ru })

/** «пт, 23 окт, 10:00» — для карточек, где важна краткость */
export const formatShortDateTime = (iso: string | Date) => format(inShopTz(iso), 'EEEEEE, d MMM, HH:mm', { locale: ru })

export const WEEKDAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
export const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
/** Порядок для российской недели: с понедельника */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function pluralize(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}
