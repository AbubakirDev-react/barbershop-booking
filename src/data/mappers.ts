import { photoUrl } from './supabase'
import type {
  AppNotification,
  Appointment,
  AppointmentStatus,
  Category,
  DayHours,
  Master,
  Review,
  Service,
  ShopSettings,
  TimeOff,
  User,
  WeeklySchedule,
} from '@/domain/types'

/* Строки таблиц в том виде, в каком их отдаёт PostgREST */
export interface SettingsRow {
  name: string
  description: string
  address: string
  phone: string
  hours_note: string
  hero_photo_path: string | null
  timezone: string
  slot_step_minutes: number
  min_lead_minutes: number
  horizon_days: number
  cancel_before_hours: number
  reschedule_before_hours: number
  link_2gis: string
  link_yandex_maps: string
  link_telegram: string
  link_instagram: string
}
export interface CategoryRow { id: string; name: string; sort: number }
export interface ServiceRow {
  id: string
  name: string
  description: string
  category_id: string | null
  price: number | string
  duration_minutes: number
  active: boolean
  sort: number
  photo_path: string | null
}
export interface MasterRow {
  id: string
  name: string
  specialization: string
  bio: string
  photo_path: string | null
  active: boolean
  user_id: string | null
  master_services: { service_id: string }[]
  schedules: { weekday: number; start_time: string; end_time: string }[]
  breaks: { weekday: number; start_time: string; end_time: string }[]
}
export interface TimeOffRow { id: string; master_id: string | null; date_from: string; date_to: string; reason: string }
export interface AppointmentRow {
  id: string
  number: number
  request_id: string
  client_user_id: string | null
  client_name: string
  client_phone: string
  master_id: string
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  source: 'online' | 'manual'
  note: string
  total: number | string
  duration_minutes: number
  created_at: string
  appointment_items?: { service_id: string | null; service_name: string; price: number | string; duration_minutes: number; position: number }[]
  status_history?: {
    at: string
    from_status: AppointmentStatus | null
    to_status: AppointmentStatus
    actor_role: string
    actor_name: string
    reason: string | null
    note: string | null
  }[]
}
export interface ReviewRow {
  id: string
  author_name: string
  rating: number
  text: string
  source: Review['source']
  source_url: string
  status: Review['status']
  created_at: string
  appointment_id: string | null
}
export interface NotificationRow {
  id: string
  scope: string
  type: AppNotification['type']
  title: string
  body: string
  appointment_id: string | null
  read: boolean
  created_at: string
}
export interface ProfileRow {
  id: string
  name: string
  surname: string
  phone: string
  email: string
  role: User['role']
  active: boolean
  reminders: boolean
  channel: 'email' | 'telegram'
  marketing: boolean
  created_at: string
}

/** numeric приходит строкой — переводим в число с точностью до копеек */
const money = (v: number | string) => Math.round(Number(v) * 100) / 100
/** 'HH:mm:ss' → 'HH:mm' */
const hm = (t: string) => t.slice(0, 5)

export const toSettings = (r: SettingsRow): ShopSettings => ({
  name: r.name,
  description: r.description,
  address: r.address,
  phone: r.phone,
  hoursNote: r.hours_note,
  heroPhoto: photoUrl(r.hero_photo_path),
  heroPhotoPath: r.hero_photo_path,
  timezone: r.timezone,
  slotStepMinutes: r.slot_step_minutes,
  minLeadMinutes: r.min_lead_minutes,
  horizonDays: r.horizon_days,
  cancelBeforeHours: r.cancel_before_hours,
  rescheduleBeforeHours: r.reschedule_before_hours,
  links: { twoGis: r.link_2gis, yandexMaps: r.link_yandex_maps, telegram: r.link_telegram, instagram: r.link_instagram },
})

export const fromSettings = (s: Partial<ShopSettings>): Partial<SettingsRow> => {
  const row: Partial<SettingsRow> = {}
  if (s.name !== undefined) row.name = s.name.trim()
  if (s.description !== undefined) row.description = s.description.trim()
  if (s.address !== undefined) row.address = s.address.trim()
  if (s.phone !== undefined) row.phone = s.phone.trim()
  if (s.hoursNote !== undefined) row.hours_note = s.hoursNote.trim()
  if (s.heroPhotoPath !== undefined) row.hero_photo_path = s.heroPhotoPath
  if (s.timezone !== undefined) row.timezone = s.timezone
  if (s.slotStepMinutes !== undefined) row.slot_step_minutes = s.slotStepMinutes
  if (s.minLeadMinutes !== undefined) row.min_lead_minutes = s.minLeadMinutes
  if (s.horizonDays !== undefined) row.horizon_days = s.horizonDays
  if (s.cancelBeforeHours !== undefined) row.cancel_before_hours = s.cancelBeforeHours
  if (s.rescheduleBeforeHours !== undefined) row.reschedule_before_hours = s.rescheduleBeforeHours
  if (s.links) {
    row.link_2gis = s.links.twoGis.trim()
    row.link_yandex_maps = s.links.yandexMaps.trim()
    row.link_telegram = s.links.telegram.trim()
    row.link_instagram = s.links.instagram.trim()
  }
  return row
}

export const toCategory = (r: CategoryRow): Category => ({ id: r.id, name: r.name, order: r.sort })

export const toService = (r: ServiceRow): Service => ({
  id: r.id,
  name: r.name,
  description: r.description,
  categoryId: r.category_id,
  price: money(r.price),
  durationMinutes: r.duration_minutes,
  active: r.active,
  order: r.sort,
  photo: photoUrl(r.photo_path),
  photoPath: r.photo_path,
})

export function toMaster(r: MasterRow): Master {
  const schedule: WeeklySchedule = [null, null, null, null, null, null, null]
  for (const s of r.schedules) {
    const day: DayHours = {
      start: hm(s.start_time),
      end: hm(s.end_time),
      breaks: r.breaks
        .filter((b) => b.weekday === s.weekday)
        .map((b) => ({ start: hm(b.start_time), end: hm(b.end_time) }))
        .sort((a, b) => a.start.localeCompare(b.start)),
    }
    schedule[s.weekday] = day
  }
  return {
    id: r.id,
    name: r.name,
    specialization: r.specialization,
    bio: r.bio,
    photo: photoUrl(r.photo_path),
    photoPath: r.photo_path,
    active: r.active,
    serviceIds: r.master_services.map((x) => x.service_id),
    schedule,
    userId: r.user_id,
  }
}

export const toTimeOff = (r: TimeOffRow): TimeOff => ({
  id: r.id,
  masterId: r.master_id,
  from: r.date_from,
  to: r.date_to,
  reason: r.reason,
})

export const toAppointment = (r: AppointmentRow): Appointment => ({
  id: r.id,
  number: r.number,
  requestId: r.request_id,
  clientUserId: r.client_user_id,
  clientName: r.client_name,
  clientPhone: r.client_phone,
  masterId: r.master_id,
  startsAt: new Date(r.starts_at).toISOString(),
  endsAt: new Date(r.ends_at).toISOString(),
  status: r.status,
  source: r.source,
  note: r.note,
  items: [...(r.appointment_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ serviceId: i.service_id ?? '', serviceName: i.service_name, price: money(i.price), durationMinutes: i.duration_minutes })),
  total: money(r.total),
  durationMinutes: r.duration_minutes,
  createdAt: r.created_at,
  history: [...(r.status_history ?? [])]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((h) => ({
      at: h.at,
      from: h.from_status,
      to: h.to_status,
      actor: (['client', 'barber', 'owner'].includes(h.actor_role) ? h.actor_role : 'system') as Appointment['history'][number]['actor'],
      actorName: h.actor_name,
      reason: h.reason ?? undefined,
      note: h.note ?? undefined,
    })),
})

export const toReview = (r: ReviewRow): Review => ({
  id: r.id,
  authorName: r.author_name,
  rating: r.rating,
  text: r.text,
  source: r.source,
  sourceUrl: r.source_url,
  status: r.status,
  createdAt: r.created_at,
  appointmentId: r.appointment_id,
})

export const toNotification = (r: NotificationRow): AppNotification => ({
  id: r.id,
  scope: r.scope,
  type: r.type,
  title: r.title,
  body: r.body,
  appointmentId: r.appointment_id,
  read: r.read,
  createdAt: r.created_at,
})

export const toUser = (r: ProfileRow): User => ({
  id: r.id,
  name: r.name,
  surname: r.surname,
  phone: r.phone,
  email: r.email,
  role: r.role,
  active: r.active,
  prefs: { reminders: r.reminders, channel: r.channel, marketing: r.marketing },
  createdAt: r.created_at,
})
