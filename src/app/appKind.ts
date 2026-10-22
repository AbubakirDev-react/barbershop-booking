/** Какой из трёх сайтов собирается: клиентский, владельца или мастера */
export type AppKind = 'client' | 'owner' | 'master'

const raw = import.meta.env.VITE_APP as string | undefined
export const APP: AppKind = raw === 'owner' || raw === 'master' ? raw : 'client'

/** Базовый путь сайта: на GitHub Pages — /barbershop-booking/, /…/owner/, /…/master/ */
export const BASE = import.meta.env.BASE_URL
