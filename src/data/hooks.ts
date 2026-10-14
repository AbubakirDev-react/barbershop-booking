import { useMemo } from 'react'
import { useDb } from './store'
import type { Master, Role, Service } from '@/domain/types'

export const useCurrentUser = () => useDb((s) => s.me)

export const isStaffRole = (role: Role | undefined) => role === 'barber' || role === 'owner'

/** Публичный каталог: только активные услуги в порядке владельца */
export function usePublicServices(): Service[] {
  const services = useDb((s) => s.services)
  return useMemo(() => services.filter((s) => s.active).sort((a, b) => a.order - b.order), [services])
}

export function usePublicMasters(): Master[] {
  const masters = useDb((s) => s.masters)
  return useMemo(() => masters.filter((m) => m.active), [masters])
}

export function useSortedCategories() {
  const categories = useDb((s) => s.categories)
  return useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories])
}

/** Мастер, привязанный к текущему барберу (если есть) */
export function useOwnMaster(): Master | null {
  const user = useCurrentUser()
  const masters = useDb((s) => s.masters)
  return useMemo(() => (user ? (masters.find((m) => m.userId === user.id) ?? null) : null), [masters, user])
}

export function useShopName() {
  const name = useDb((s) => s.settings.name)
  return name || 'Барбершоп'
}
