import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error('Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в .env')
}

interface ClerkLike {
  session?: { getToken: () => Promise<string | null> } | null
}

/**
 * Supabase принимает сессию Clerk (Third-Party Auth): к каждому запросу
 * прикладывается свежий токен Clerk, а RLS читает из него `sub`.
 * Без входа токена нет — запросы идут от роли anon.
 */
export const supabase = createClient(url, key, {
  accessToken: async () => {
    const clerk = (window as unknown as { Clerk?: ClerkLike }).Clerk
    return (await clerk?.session?.getToken()) ?? null
  },
})

export const PHOTO_BUCKET = 'photos'

export const photoUrl = (path: string | null) =>
  path ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl : null
