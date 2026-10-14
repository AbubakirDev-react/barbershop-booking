import type { Category, ShopSettings, UserPrefs, WeeklySchedule } from '@/domain/types'

/**
 * Настройки по умолчанию содержат только технические правила записи.
 * Название, адрес, телефон и ссылки пустые: их задаёт владелец, мы их не выдумываем.
 */
export const DEFAULT_SETTINGS: ShopSettings = {
  name: '',
  description: '',
  address: '',
  phone: '',
  hoursNote: '',
  heroPhoto: null,
  heroPhotoPath: null,
  timezone: 'Europe/Moscow',
  slotStepMinutes: 30,
  minLeadMinutes: 60,
  horizonDays: 30,
  cancelBeforeHours: 2,
  rescheduleBeforeHours: 2,
  links: { twoGis: '', yandexMaps: '', telegram: '', instagram: '' },
  telegramBotUsername: '',
  emailRemindersEnabled: false,
}

/** Категории из плана; владелец может переименовать, переставить и удалить */
export const DEFAULT_CATEGORIES: Category[] = ['Стрижка', 'Борода', 'Комплексы', 'Скидки', 'Новинки'].map(
  (name, order) => ({ id: `cat-default-${order}`, name, order }),
)

export const EMPTY_SCHEDULE: WeeklySchedule = [null, null, null, null, null, null, null]

export const DEFAULT_PREFS: UserPrefs = { reminders: true, channel: 'email', marketing: false }
