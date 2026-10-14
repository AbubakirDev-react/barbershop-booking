import { useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom'
import { useClerk } from '@clerk/clerk-react'
import { useDb } from '@/data/store'
import { useCurrentUser, useShopName } from '@/data/hooks'
import type { Role } from '@/domain/types'
import { Icon, type IconName } from '@/shared/ui'
import { ThemeToggle } from './ThemeToggle'
import './dashboard-layout.css'

const NAV: { to: string; label: string; icon: IconName; roles: Role[]; end?: boolean }[] = [
  { to: '/dashboard', label: 'Сегодня', icon: 'home', roles: ['barber', 'owner'], end: true },
  { to: '/dashboard/calendar', label: 'Календарь', icon: 'calendar', roles: ['barber', 'owner'] },
  { to: '/dashboard/appointments', label: 'Записи', icon: 'list', roles: ['barber', 'owner'] },
  { to: '/dashboard/clients', label: 'Клиенты', icon: 'users', roles: ['barber', 'owner'] },
  { to: '/dashboard/notifications', label: 'Уведомления', icon: 'bell', roles: ['barber', 'owner'] },
  { to: '/dashboard/services', label: 'Услуги', icon: 'scissors', roles: ['owner'] },
  { to: '/dashboard/categories', label: 'Категории', icon: 'tag', roles: ['owner'] },
  { to: '/dashboard/masters', label: 'Мастера', icon: 'user', roles: ['owner'] },
  { to: '/dashboard/reviews', label: 'Отзывы', icon: 'star', roles: ['owner'] },
  { to: '/dashboard/analytics', label: 'Аналитика', icon: 'chart', roles: ['owner'] },
  { to: '/dashboard/users', label: 'Пользователи', icon: 'users', roles: ['owner'] },
  { to: '/dashboard/settings', label: 'Настройки', icon: 'settings', roles: ['barber', 'owner'] },
]

const ROLE_LABEL: Record<Role, string> = { client: 'Клиент', barber: 'Барбер', owner: 'Владелец' }

export default function DashboardLayout() {
  const user = useCurrentUser()!
  const shopName = useShopName()
  const { signOut } = useClerk()
  const unread = useDb((s) => s.notifications.filter((n) => n.scope === 'staff' && !n.read).length)
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [prevPath, setPrevPath] = useState(location.pathname)
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname)
    setOpen(false)
  }

  const items = NAV.filter((n) => n.roles.includes(user.role))

  return (
    <div className="dash">
      <a className="skip-link" href="#dash-main">Перейти к содержимому</a>
      <aside className={`dash__side${open ? ' is-open' : ''}`} aria-label="Меню панели">
        <div className="dash__brand">
          <Link to="/" className="brand">
            <span className="brand__mark pole" aria-hidden />
            <span className="brand__name">{shopName}</span>
          </Link>
        </div>
        <nav className="dash__nav">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="dash__link">
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.to === '/dashboard/notifications' && unread > 0 && (
                <span className="dash__count" aria-label={`${unread} непрочитанных`}>{unread}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="dash__user">
          <div style={{ minWidth: 0 }}>
            <p className="dash__user-name">{user.name} {user.surname}</p>
            <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            className="btn btn--ghost btn--icon btn--sm"
            aria-label="Выйти"
            title="Выйти"
            onClick={() => void signOut(() => navigate('/'))}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      {open && <div className="dash__scrim" onClick={() => setOpen(false)} aria-hidden />}

      <div className="dash__body">
        <header className="dash__top">
          <button
            className="btn btn--ghost btn--icon dash__burger"
            aria-label="Открыть меню"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" size={22} />
          </button>
          <div className="dash__top-actions">
            <Link to="/dashboard/notifications" className="btn btn--ghost btn--icon" aria-label={`Уведомления${unread ? `: ${unread} новых` : ''}`}>
              <Icon name="bell" />
              {unread > 0 && <span className="dash__dot" aria-hidden />}
            </Link>
            <ThemeToggle />
            <Link to="/" className="btn btn--ghost btn--sm">На сайт</Link>
          </div>
        </header>
        <main id="dash-main" className="dash__main">
          <Outlet />
        </main>
      </div>
      <ScrollRestoration />
    </div>
  )
}
