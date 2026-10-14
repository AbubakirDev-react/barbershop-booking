import { useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'barbershop-theme'

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function apply(theme: Theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

export const applyStoredTheme = () => apply(read())

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read)
  const update = (t: Theme) => {
    setTheme(t)
    apply(t)
    try {
      if (t === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, t)
    } catch {
      // Хранилище недоступно (приватный режим) — тема просто не запомнится
    }
  }
  return [theme, update] as const
}
