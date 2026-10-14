import { useTheme } from '@/shared/theme'
import { Icon } from '@/shared/ui'

export function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const isDark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return (
    <button
      className="btn btn--ghost btn--icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
    >
      <Icon name={isDark ? 'sun' : 'moon'} />
    </button>
  )
}
