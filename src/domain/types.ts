export type Role = 'client' | 'barber' | 'owner'

export const APPOINTMENT_STATUSES = [
  'pending',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export type AppointmentSource = 'online' | 'manual'
export type Actor = Role | 'system'

export interface Category {
  id: string
  name: string
  order: number
}

export interface Service {
  id: string
  name: string
  description: string
  categoryId: string | null
  /** Цена в рублях, до копеек */
  price: number
  durationMinutes: number
  active: boolean
  order: number
  /** Публичный URL фото (вычисляется из photoPath) */
  photo: string | null
  /** Путь файла в Supabase Storage */
  photoPath: string | null
}

export interface DayHours {
  /** 'HH:mm' */
  start: string
  end: string
  breaks: { start: string; end: string }[]
}

/** Индекс = getDay(): 0 — воскресенье … 6 — суббота. null — выходной */
export type WeeklySchedule = (DayHours | null)[]

export interface Master {
  id: string
  name: string
  specialization: string
  bio: string
  photo: string | null
  photoPath: string | null
  active: boolean
  serviceIds: string[]
  schedule: WeeklySchedule
  /** Пользователь панели, привязанный к мастеру */
  userId: string | null
}

export interface TimeOff {
  id: string
  /** null — выходной для всего барбершопа */
  masterId: string | null
  /** 'yyyy-MM-dd', включительно */
  from: string
  to: string
  reason: string
}

export interface AppointmentItem {
  serviceId: string
  /** Снимок на момент записи: изменение каталога не меняет историю */
  serviceName: string
  price: number
  durationMinutes: number
}

export interface StatusEvent {
  at: string
  from: AppointmentStatus | null
  to: AppointmentStatus
  actor: Actor
  actorName: string
  reason?: string
  /** Для переносов: прежнее время начала */
  note?: string
}

export interface Appointment {
  id: string
  number: number
  requestId: string
  clientUserId: string | null
  clientName: string
  clientPhone: string
  masterId: string
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  source: AppointmentSource
  note: string
  items: AppointmentItem[]
  total: number
  durationMinutes: number
  createdAt: string
  history: StatusEvent[]
  isDemo?: boolean
}

export interface ShopSettings {
  name: string
  description: string
  address: string
  phone: string
  /** Свободный текст для публичной страницы, если расписание сложное */
  hoursNote: string
  /** Фото для главной страницы — загружает владелец */
  heroPhoto: string | null
  heroPhotoPath: string | null
  timezone: string
  slotStepMinutes: number
  minLeadMinutes: number
  horizonDays: number
  cancelBeforeHours: number
  rescheduleBeforeHours: number
  links: { twoGis: string; yandexMaps: string; telegram: string; instagram: string }
  /** Username Telegram-бота напоминаний; пусто — бот не подключён */
  telegramBotUsername: string
  /** Email-напоминания работают только со своим доменом в Resend */
  emailRemindersEnabled: boolean
}

export type ReviewStatus = 'pending' | 'published' | 'hidden'
export type ReviewSource = 'site' | '2gis' | 'yandex' | 'manual'

export interface Review {
  id: string
  authorName: string
  rating: number
  text: string
  source: ReviewSource
  sourceUrl: string
  status: ReviewStatus
  createdAt: string
  /** Для отзывов с сайта: запись, по которой подтверждён визит */
  appointmentId: string | null
}

export type NotificationType =
  | 'appointment_created'
  | 'appointment_confirmed'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'needs_attention'

export interface AppNotification {
  id: string
  /** 'staff' — для всей панели, иначе id пользователя */
  scope: string
  type: NotificationType
  title: string
  body: string
  appointmentId: string | null
  read: boolean
  createdAt: string
}

export interface UserPrefs {
  reminders: boolean
  channel: 'email' | 'telegram'
  marketing: boolean
}

export interface User {
  id: string
  name: string
  surname: string
  phone: string
  email: string
  role: Role
  active: boolean
  prefs: UserPrefs
  /** Подключён ли Telegram-чат для напоминаний */
  telegramLinked: boolean
  createdAt: string
}
