import { useEffect } from 'react'
import { useShopName } from '@/data/hooks'

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

/**
 * Заголовок, описание и Open Graph для страницы. Приватные страницы
 * помечаются noindex — панели и профили не должны попадать в поиск.
 */
export function usePageMeta(title: string, description = '', opts: { noindex?: boolean } = {}) {
  const shop = useShopName()
  useEffect(() => {
    const full = title ? `${title} — ${shop}` : shop
    document.title = full
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', window.location.href)
    setMeta('name', 'robots', opts.noindex ? 'noindex, nofollow' : 'index, follow')
    setCanonical(window.location.origin + window.location.pathname)
  }, [title, description, shop, opts.noindex])
}
