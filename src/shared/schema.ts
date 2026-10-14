import { useEffect } from 'react'
import { useDb } from '@/data/store'

/**
 * Разметка Schema.org LocalBusiness — только если владелец указал адрес.
 * Без адреса разметку не добавляем, чтобы не публиковать неполные данные.
 */
export function useLocalBusinessSchema() {
  const s = useDb((st) => st.settings)
  useEffect(() => {
    const id = 'ld-local-business'
    document.getElementById(id)?.remove()
    if (!s.address || !s.name) return
    const el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = id
    el.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'HairSalon',
      name: s.name,
      address: s.address,
      telephone: s.phone || undefined,
      url: window.location.origin,
      priceRange: '₽₽',
      currenciesAccepted: 'RUB',
      paymentAccepted: 'Оплата в барбершопе',
    })
    document.head.appendChild(el)
    return () => el.remove()
  }, [s.address, s.name, s.phone])
}
