import { createClient } from '@supabase/supabase-js'
import { APP } from '@/app/appKind'

// Адрес может быть относительным (/sb) — тогда запросы идут через прокси на том же домене
const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const url = rawUrl?.startsWith('/') ? window.location.origin + rawUrl : rawUrl
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY')
}

/**
 * Клиенты работают без входа (роль anon + токен сессии в функциях client_*).
 * Сотрудники входят через Supabase Auth. У сайтов владельца и мастера свой
 * ключ хранения сессии: все три сайта живут на одном домене GitHub Pages.
 */
export const supabase = createClient(url, key, {
  auth: { storageKey: `bb-${APP}-auth`, persistSession: APP !== 'client', autoRefreshToken: APP !== 'client' },
})

export const PHOTO_BUCKET = 'photos'

export const photoUrl = (path: string | null) =>
  path ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl : null
