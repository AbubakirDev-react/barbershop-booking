import { create } from 'zustand'
import { addDays } from 'date-fns'
import type { PostgrestError } from '@supabase/supabase-js'
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './defaults'
import { PHOTO_BUCKET, supabase } from './supabase'
import { setShopTimezone } from '@/domain/tz'
import {
  fromSettings,
  toAppointment,
  toCategory,
  toMaster,
  toNotification,
  toReview,
  toService,
  toSettings,
  toTimeOff,
  toUser,
  type AppointmentRow,
  type CategoryRow,
  type MasterRow,
  type NotificationRow,
  type ProfileRow,
  type ReviewRow,
  type ServiceRow,
  type SettingsRow,
  type TimeOffRow,
} from './mappers'
import type {
  AppNotification,
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  Category,
  Master,
  Review,
  ReviewStatus,
  Role,
  Service,
  ShopSettings,
  TimeOff,
  User,
  UserPrefs,
} from '@/domain/types'

/**
 * Слой данных поверх Supabase. Хранит кэш для интерфейса, а все изменения
 * отправляет на сервер: записи — через RPC-функции, каталог — через таблицы
 * под RLS. После изменения кэш перечитывается, поэтому UI показывает только
 * то, что подтвердила база.
 */

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string }
const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = <T = never,>(error: string): Result<T> => ({ ok: false, error })

/** Ошибки бизнес-правил приходят из SQL уже на русском; остальное переводим */
function errorText(e: PostgrestError | Error | null | undefined): string {
  if (!e) return 'Неизвестная ошибка'
  const code = 'code' in e ? e.code : undefined
  if (code === 'P0001') return e.message
  if (code === '42501') return 'Недостаточно прав для этого действия'
  if (code === '23505') return 'Такая запись уже существует'
  if (code === '23514') return 'Проверьте введённые значения'
  if (/fetch|network/i.test(e.message)) return 'Нет связи с сервером. Проверьте интернет и повторите'
  console.error('[data]', e)
  return 'Не удалось выполнить действие. Повторите позже'
}

/** Интервал занятости без персональных данных — для расчёта свободных слотов */
export interface BusyInterval {
  id: string
  masterId: string
  startsAt: string
  endsAt: string
  status: AppointmentStatus
}

export interface DbState {
  status: 'loading' | 'ready' | 'error'
  loadError: string | null
  settings: ShopSettings
  categories: Category[]
  services: Service[]
  masters: Master[]
  timeOff: TimeOff[]
  busy: BusyInterval[]
  appointments: Appointment[]
  reviews: Review[]
  notifications: AppNotification[]
  users: User[]
  me: User | null
  authReady: boolean
}

export interface CreateAppointmentInput {
  requestId: string
  masterId: string
  serviceIds: string[]
  startsAt: string
  clientName: string
  clientPhone: string
  note?: string
  source: AppointmentSource
}

export interface ServiceInput {
  id?: string
  name: string
  description: string
  categoryId: string | null
  price: number
  durationMinutes: number
  active: boolean
  /** URL существующего фото, data URL нового или null */
  photo: string | null
  photoPath?: string | null
}

export interface MasterInput {
  id?: string
  name: string
  specialization: string
  bio: string
  photo: string | null
  photoPath?: string | null
  active: boolean
  serviceIds: string[]
  schedule: Master['schedule']
}

export interface AuthIdentity {
  name: string
  surname: string
  email: string
}

interface DbActions {
  loadPublic: () => Promise<void>
  setIdentity: (identity: AuthIdentity | null) => Promise<void>
  refreshPrivate: () => Promise<void>

  updateProfile: (patch: Pick<User, 'name' | 'surname' | 'phone' | 'email'>) => Promise<Result>
  updatePrefs: (patch: Partial<UserPrefs>) => Promise<Result>
  deleteProfile: () => Promise<Result>
  claimFirstOwner: () => Promise<Result<boolean>>
  createTelegramLink: () => Promise<Result<string>>
  unlinkTelegram: () => Promise<Result>
  reloadMe: () => Promise<void>

  createAppointment: (input: CreateAppointmentInput) => Promise<Result<Appointment>>
  changeStatus: (id: string, to: AppointmentStatus, reason?: string) => Promise<Result>
  reschedule: (id: string, startsAt: string) => Promise<Result>

  saveService: (input: ServiceInput) => Promise<Result>
  removeService: (id: string) => Promise<Result<'deleted' | 'archived'>>
  moveService: (id: string, dir: -1 | 1) => Promise<Result>
  saveCategory: (input: { id?: string; name: string }) => Promise<Result>
  removeCategory: (id: string) => Promise<Result>
  moveCategory: (id: string, dir: -1 | 1) => Promise<Result>
  saveMaster: (input: MasterInput) => Promise<Result>
  setMasterActive: (id: string, active: boolean) => Promise<Result>
  setMasterUser: (masterId: string, userId: string | null) => Promise<Result>
  addTimeOff: (input: Omit<TimeOff, 'id'>) => Promise<Result>
  removeTimeOff: (id: string) => Promise<Result>

  addSiteReview: (input: { rating: number; text: string; appointmentId: string }) => Promise<Result>
  addManualReview: (input: Pick<Review, 'authorName' | 'rating' | 'text' | 'source' | 'sourceUrl'>) => Promise<Result>
  setReviewStatus: (id: string, status: ReviewStatus) => Promise<Result>

  markRead: (id: string) => Promise<Result>
  markAllRead: (scope: string) => Promise<Result>

  setUserRole: (userId: string, role: Role) => Promise<Result>
  setUserActive: (userId: string, active: boolean) => Promise<Result>
  updateSettings: (patch: Partial<ShopSettings>) => Promise<Result>
}

const MASTER_SELECT = '*, master_services(service_id), schedules(weekday, start_time, end_time), breaks(weekday, start_time, end_time)'
const APPOINTMENT_SELECT =
  '*, appointment_items(service_id, service_name, price, duration_minutes, position), status_history(at, from_status, to_status, actor_role, actor_name, reason, note)'

const isStaff = (u: User | null) => u?.role === 'barber' || u?.role === 'owner'

/** Загружает фото из data URL в Storage и возвращает путь; существующее фото не трогает */
async function resolvePhoto(photo: string | null, currentPath: string | null | undefined, folder: string): Promise<Result<string | null>> {
  if (!photo) return ok(null)
  if (!photo.startsWith('data:')) return ok(currentPath ?? null)
  const blob = await (await fetch(photo)).blob()
  const path = `${folder}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type || 'image/webp' })
  if (error) return fail('Не удалось загрузить фото: ' + (error.message.includes('size') ? 'файл слишком большой' : 'попробуйте другой файл'))
  return ok(path)
}

/** Удаление старого файла после замены. Ошибка не критична: файл станет «сиротой», но данные корректны */
async function dropPhoto(oldPath: string | null | undefined, newPath: string | null) {
  if (!oldPath || oldPath === newPath) return
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([oldPath])
  if (error) console.warn('[photos] не удалось удалить старый файл', oldPath, error.message)
}

export const useDb = create<DbState & DbActions>()((set, get) => {
  const loadCatalog = async () => {
    const [settings, categories, services, masters, timeOff, reviews] = await Promise.all([
      supabase.from('shop_settings').select('*').eq('id', 1).single<SettingsRow>(),
      supabase.from('categories').select('*').order('sort').returns<CategoryRow[]>(),
      supabase.from('services').select('*').order('sort').returns<ServiceRow[]>(),
      supabase.from('masters').select(MASTER_SELECT).order('created_at').returns<MasterRow[]>(),
      supabase.from('time_off').select('*').order('date_from').returns<TimeOffRow[]>(),
      supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(200).returns<ReviewRow[]>(),
    ])
    const firstError = [settings, categories, services, masters, timeOff, reviews].find((r) => r.error)?.error
    if (firstError) throw firstError
    const shopSettings = toSettings(settings.data!)
    // Пояс задаётся до обновления состояния, чтобы первый же рендер считал даты верно
    setShopTimezone(shopSettings.timezone)
    set({
      settings: shopSettings,
      categories: categories.data!.map(toCategory),
      services: services.data!.map(toService),
      masters: masters.data!.map(toMaster),
      timeOff: timeOff.data!.map(toTimeOff),
      reviews: reviews.data!.map(toReview),
    })
  }

  const loadBusy = async () => {
    const from = addDays(new Date(), -1).toISOString()
    const to = addDays(new Date(), get().settings.horizonDays + 2).toISOString()
    const { data, error } = await supabase.rpc('get_busy_intervals', { p_from: from, p_to: to })
    if (error) throw error
    set({
      busy: (data as { id: string; master_id: string; starts_at: string; ends_at: string }[]).map((b) => ({
        id: b.id,
        masterId: b.master_id,
        startsAt: new Date(b.starts_at).toISOString(),
        endsAt: new Date(b.ends_at).toISOString(),
        status: 'confirmed' as const,
      })),
    })
  }

  const loadPrivate = async () => {
    const me = get().me
    if (!me) {
      set({ appointments: [], notifications: [], users: [] })
      return
    }
    // Сотрудникам — записи за последний год и будущие; клиенту — только свои
    let query = supabase.from('appointments').select(APPOINTMENT_SELECT).order('starts_at', { ascending: false })
    query = isStaff(me) ? query.gte('starts_at', addDays(new Date(), -366).toISOString()) : query.eq('client_user_id', me.id)
    const [appts, notifs, users] = await Promise.all([
      query.limit(5000).returns<AppointmentRow[]>(),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200).returns<NotificationRow[]>(),
      me.role === 'owner'
        ? supabase.from('profiles').select('*').order('created_at').returns<ProfileRow[]>()
        : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    ])
    const firstError = [appts, notifs, users].find((r) => r.error)?.error
    if (firstError) throw firstError
    set({
      appointments: appts.data!.map(toAppointment),
      notifications: notifs.data!.map(toNotification),
      users: users.data!.map(toUser),
    })
  }

  /** Обёртка: выполнить изменение, перечитать данные, вернуть Result */
  const mutate = async <T,>(
    run: () => PromiseLike<{ data: T | null; error: PostgrestError | null }>,
    reload: ('catalog' | 'private' | 'busy')[],
  ): Promise<Result<T>> => {
    try {
      const { data, error } = await run()
      if (error) return fail(errorText(error))
      await Promise.all(
        reload.map((r) => (r === 'catalog' ? loadCatalog() : r === 'private' ? loadPrivate() : loadBusy())),
      )
      return ok(data as T)
    } catch (e) {
      return fail(errorText(e as Error))
    }
  }

  const requireMe = () => get().me

  return {
    status: 'loading',
    loadError: null,
    settings: DEFAULT_SETTINGS,
    categories: DEFAULT_CATEGORIES,
    services: [],
    masters: [],
    timeOff: [],
    busy: [],
    appointments: [],
    reviews: [],
    notifications: [],
    users: [],
    me: null,
    authReady: false,

    loadPublic: async () => {
      try {
        await loadCatalog()
        await loadBusy()
        set({ status: 'ready', loadError: null })
      } catch (e) {
        set({ status: 'error', loadError: errorText(e as Error) })
      }
    },

    setIdentity: async (identity) => {
      if (!identity) {
        set({ me: null, appointments: [], notifications: [], users: [], authReady: true })
        // Публичные данные перечитываем от роли anon: сотрудник мог видеть скрытые услуги
        await get().loadPublic()
        return
      }
      const { data, error } = await supabase.rpc('ensure_profile', {
        p_name: identity.name,
        p_surname: identity.surname,
        p_email: identity.email,
      })
      if (error) {
        set({ me: null, authReady: true, loadError: errorText(error) })
        return
      }
      const me = toUser(data as ProfileRow)
      set({ me: me.active ? me : null, authReady: true })
      try {
        await Promise.all([loadCatalog(), loadBusy(), loadPrivate()])
        set({ status: 'ready', loadError: null })
      } catch (e) {
        set({ status: 'error', loadError: errorText(e as Error) })
      }
    },

    refreshPrivate: async () => {
      try {
        await Promise.all([loadPrivate(), loadBusy()])
      } catch (e) {
        console.warn('[data] не удалось обновить данные', e)
      }
    },

    updateProfile: async (patch) => {
      const me = requireMe()
      if (!me) return fail('Войдите в аккаунт')
      const res = await mutate(
        () => supabase.from('profiles').update({ name: patch.name, surname: patch.surname, phone: patch.phone, email: patch.email }).eq('id', me.id).select('*').single<ProfileRow>(),
        [],
      )
      if (res.ok && res.value) set({ me: toUser(res.value) })
      return res.ok ? ok(undefined) : res
    },

    updatePrefs: async (patch) => {
      const me = requireMe()
      if (!me) return fail('Войдите в аккаунт')
      const row: Partial<ProfileRow> = {}
      if (patch.reminders !== undefined) row.reminders = patch.reminders
      if (patch.channel !== undefined) row.channel = patch.channel
      if (patch.marketing !== undefined) row.marketing = patch.marketing
      const res = await mutate(() => supabase.from('profiles').update(row).eq('id', me.id).select('*').single<ProfileRow>(), [])
      if (res.ok && res.value) set({ me: toUser(res.value) })
      return res.ok ? ok(undefined) : res
    },

    deleteProfile: async () => {
      const me = requireMe()
      if (!me) return fail('Войдите в аккаунт')
      if (me.role !== 'client') return fail('Сотрудник не может удалить аккаунт сам — обратитесь к владельцу')
      const res = await mutate(() => supabase.from('profiles').delete().eq('id', me.id), [])
      if (res.ok) set({ me: null, appointments: [], notifications: [] })
      return res.ok ? ok(undefined) : res
    },

    // Ссылка t.me/<бот>?start=<код>; код одноразовый и действует 15 минут
    createTelegramLink: async () => {
      const bot = get().settings.telegramBotUsername
      if (!bot) return fail('Telegram-бот барбершопа ещё не подключён')
      const res = await mutate(async () => supabase.rpc('create_telegram_link'), [])
      return res.ok ? ok(`https://t.me/${bot}?start=${res.value as string}`) : res
    },

    unlinkTelegram: async () => {
      const res = await mutate(async () => supabase.rpc('unlink_telegram'), [])
      if (res.ok) await get().reloadMe()
      return res.ok ? ok(undefined) : res
    },

    reloadMe: async () => {
      const me = get().me
      if (!me) return
      const { data, error } = await supabase.from('profiles').select('*').eq('id', me.id).single<ProfileRow>()
      if (error) console.warn('[data] профиль не обновлён', error.message)
      else set({ me: toUser(data) })
    },

    claimFirstOwner: async () => {
      const res = await mutate(async () => supabase.rpc('claim_first_owner'), [])
      if (!res.ok) return res
      if (res.value) {
        const { data } = await supabase.from('profiles').select('*').eq('id', get().me!.id).single<ProfileRow>()
        if (data) set({ me: toUser(data) })
        await Promise.all([loadCatalog(), loadPrivate()])
      }
      return ok(Boolean(res.value))
    },

    createAppointment: async (input) => {
      const res = await mutate(
        async () =>
          supabase.rpc('create_appointment', {
            p_request_id: input.requestId,
            p_master_id: input.masterId,
            p_service_ids: input.serviceIds,
            p_starts_at: input.startsAt,
            p_client_name: input.clientName,
            p_client_phone: input.clientPhone,
            p_note: input.note ?? '',
            p_source: input.source,
          }),
        ['private', 'busy'],
      )
      if (!res.ok) return res
      const id = (res.value as { id: string }).id
      const appt = get().appointments.find((a) => a.id === id)
      return appt ? ok(appt) : fail('Запись создана, но не загрузилась. Обновите страницу')
    },

    changeStatus: async (id, to, reason) => {
      const res = await mutate(
        async () => supabase.rpc('change_appointment_status', { p_id: id, p_to: to, p_reason: reason ?? null }),
        ['private', 'busy'],
      )
      return res.ok ? ok(undefined) : res
    },

    reschedule: async (id, startsAt) => {
      const res = await mutate(async () => supabase.rpc('reschedule_appointment', { p_id: id, p_starts_at: startsAt }), ['private', 'busy'])
      return res.ok ? ok(undefined) : res
    },

    saveService: async (input) => {
      const name = input.name.trim()
      if (!name) return fail('Укажите название услуги')
      const photo = await resolvePhoto(input.photo, input.photoPath, 'services')
      if (!photo.ok) return photo
      const row = {
        name,
        description: input.description.trim(),
        category_id: input.categoryId,
        price: Math.round(input.price * 100) / 100,
        duration_minutes: Math.round(input.durationMinutes),
        active: input.active,
        photo_path: photo.value,
      }
      const res = input.id
        ? await mutate(() => supabase.from('services').update(row).eq('id', input.id!), ['catalog'])
        : await mutate(() => supabase.from('services').insert({ ...row, sort: get().services.length }), ['catalog'])
      if (res.ok) await dropPhoto(input.photoPath, photo.value)
      return res.ok ? ok(undefined) : res
    },

    removeService: async (id) => {
      const res = await mutate(async () => supabase.rpc('remove_service', { p_id: id }), ['catalog'])
      return res.ok ? ok(res.value as 'deleted' | 'archived') : res
    },

    moveService: async (id, dir) => {
      const sorted = [...get().services].sort((a, b) => a.order - b.order)
      const i = sorted.findIndex((x) => x.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= sorted.length) return ok(undefined)
      ;[sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!]
      const res = await mutate(
        async () => {
          const results = await Promise.all(sorted.map((s, sort) => supabase.from('services').update({ sort }).eq('id', s.id)))
          return { data: null, error: results.find((r) => r.error)?.error ?? null }
        },
        ['catalog'],
      )
      return res.ok ? ok(undefined) : res
    },

    saveCategory: async (input) => {
      const name = input.name.trim()
      if (!name) return fail('Укажите название категории')
      if (get().categories.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== input.id)) {
        return fail('Такая категория уже есть')
      }
      const res = input.id
        ? await mutate(() => supabase.from('categories').update({ name }).eq('id', input.id!), ['catalog'])
        : await mutate(() => supabase.from('categories').insert({ name, sort: get().categories.length }), ['catalog'])
      return res.ok ? ok(undefined) : res
    },

    // Услуги категории не удаляются: внешний ключ переводит их в «без категории»
    removeCategory: async (id) => {
      const res = await mutate(() => supabase.from('categories').delete().eq('id', id), ['catalog'])
      return res.ok ? ok(undefined) : res
    },

    moveCategory: async (id, dir) => {
      const sorted = [...get().categories].sort((a, b) => a.order - b.order)
      const i = sorted.findIndex((x) => x.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= sorted.length) return ok(undefined)
      ;[sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!]
      const res = await mutate(
        async () => {
          const results = await Promise.all(sorted.map((c, sort) => supabase.from('categories').update({ sort }).eq('id', c.id)))
          return { data: null, error: results.find((r) => r.error)?.error ?? null }
        },
        ['catalog'],
      )
      return res.ok ? ok(undefined) : res
    },

    saveMaster: async (input) => {
      const photo = await resolvePhoto(input.photo, input.photoPath, 'masters')
      if (!photo.ok) return photo
      const res = await mutate(
        async () =>
          supabase.rpc('save_master', {
            p_id: input.id ?? null,
            p_name: input.name,
            p_specialization: input.specialization,
            p_bio: input.bio,
            p_photo_path: photo.value,
            p_active: input.active,
            p_service_ids: input.serviceIds,
            p_schedule: input.schedule.map((d) => d ?? null),
          }),
        ['catalog', 'busy'],
      )
      if (res.ok) await dropPhoto(input.photoPath, photo.value)
      return res.ok ? ok(undefined) : res
    },

    // Деактивация не трогает записи: история остаётся привязанной к мастеру
    setMasterActive: async (id, active) => {
      const res = await mutate(() => supabase.from('masters').update({ active }).eq('id', id), ['catalog'])
      return res.ok ? ok(undefined) : res
    },

    // Привязка аккаунта барбера: после неё он видит только записи своего мастера
    setMasterUser: async (masterId, userId) => {
      const res = await mutate(async () => supabase.rpc('set_master_user', { p_master: masterId, p_user: userId }), ['catalog'])
      return res.ok ? ok(undefined) : res
    },

    addTimeOff: async (input) => {
      if (input.to < input.from) return fail('Конец периода раньше начала')
      const res = await mutate(
        () => supabase.from('time_off').insert({ master_id: input.masterId, date_from: input.from, date_to: input.to, reason: input.reason.trim() }),
        ['catalog'],
      )
      return res.ok ? ok(undefined) : res
    },

    removeTimeOff: async (id) => {
      const res = await mutate(() => supabase.from('time_off').delete().eq('id', id), ['catalog'])
      return res.ok ? ok(undefined) : res
    },

    addSiteReview: async ({ rating, text, appointmentId }) => {
      const res = await mutate(
        async () => supabase.rpc('add_site_review', { p_appointment_id: appointmentId, p_rating: rating, p_text: text }),
        ['catalog'],
      )
      return res.ok ? ok(undefined) : res
    },

    addManualReview: async (input) => {
      if (!input.authorName.trim() || !input.text.trim()) return fail('Укажите автора и текст отзыва')
      if (!/^https?:\/\//.test(input.sourceUrl.trim())) return fail('Укажите ссылку на источник отзыва (https://…)')
      const res = await mutate(
        () =>
          supabase.from('reviews').insert({
            author_name: input.authorName.trim(),
            rating: input.rating,
            text: input.text.trim(),
            source: input.source,
            source_url: input.sourceUrl.trim(),
            status: 'published',
          }),
        ['catalog'],
      )
      return res.ok ? ok(undefined) : res
    },

    setReviewStatus: async (id, status) => {
      const res = await mutate(() => supabase.from('reviews').update({ status }).eq('id', id), ['catalog'])
      return res.ok ? ok(undefined) : res
    },

    markRead: async (id) => {
      set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
      return error ? fail(errorText(error)) : ok(undefined)
    },

    markAllRead: async (scope) => {
      set((s) => ({ notifications: s.notifications.map((n) => (n.scope === scope ? { ...n, read: true } : n)) }))
      const { error } = await supabase.from('notifications').update({ read: true }).eq('scope', scope).eq('read', false)
      return error ? fail(errorText(error)) : ok(undefined)
    },

    setUserRole: async (userId, role) => {
      const res = await mutate(async () => supabase.rpc('set_user_role', { p_user: userId, p_role: role }), ['private'])
      return res.ok ? ok(undefined) : res
    },

    setUserActive: async (userId, active) => {
      const res = await mutate(async () => supabase.rpc('set_user_active', { p_user: userId, p_active: active }), ['private'])
      return res.ok ? ok(undefined) : res
    },

    updateSettings: async (patch) => {
      const current = get().settings
      let heroPath = current.heroPhotoPath
      if (patch.heroPhoto !== undefined) {
        const photo = await resolvePhoto(patch.heroPhoto, current.heroPhotoPath, 'brand')
        if (!photo.ok) return photo
        heroPath = photo.value
      }
      const row = fromSettings({ ...patch, heroPhotoPath: heroPath })
      const res = await mutate(() => supabase.from('shop_settings').update({ ...row, updated_at: new Date().toISOString() }).eq('id', 1), ['catalog', 'busy'])
      if (res.ok) await dropPhoto(current.heroPhotoPath, heroPath)
      return res.ok ? ok(undefined) : res
    },
  }
})
