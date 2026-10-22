import { useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { useDb } from '@/data/store'
import { useShopName } from '@/data/hooks'
import { supabase } from '@/data/supabase'
import type { Role } from '@/domain/types'
import { Icon, type IconName } from '@/shared/ui'
import './dashboard-layout.css'

type Kind = 'owner' | 'master'

const NAV: Record<Kind, { to: string; label: string; icon: IconName; end?: boolean }[]> = {
  master: [
    { to: '/', label: 'Сегодня', icon: 'home', end: true },
    { to: '/calendar', label: 'Календарь', icon: 'calendar' },
    { to: '/appointments', label: 'Записи', icon: 'list' },
    { to: '/clients', label: 'Клиенты', icon: 'users' },
    { to: '/notifications', label: 'Уведомления', icon: 'bell' },
  ],
  owner: [
    { to: '/', label: 'Сегодня', icon: 'home', end: true },
    { to: '/calendar', label: 'Календарь', icon: 'calendar' },
    { to: '/appointments', label: 'Записи', icon: 'list' },
    { to: '/clients', label: 'Клиенты', icon: 'users' },
    { to: '/notifications', label: 'Уведомления', icon: 'bell' },
    { to: '/services', label: 'Услуги', icon: 'scissors' },
    { to: '/categories', label: 'Категории', icon: 'tag' },
    { to: '/masters', label: 'Мастера', icon: 'user' },
    { to: '/reviews', label: 'Отзывы', icon: 'star' },
    { to: '/analytics', label: 'Аналитика', icon: 'chart' },
    { to: '/users', label: 'Сотрудники', icon: 'users' },
    { to: '/settings', label: 'Настройки', icon: 'settings' },
  ],
}

/** Нижние вкладки на планшете и телефоне: у мастера все разделы, у владельца — основные + «Ещё» */
const TAB_COUNT: Record<Kind, number> = { master: 5, owner: 4 }

const ROLE_LABEL: Record<Role, string> = { client: 'Без роли', barber: 'Мастер', owner: 'Владелец' }

export default function DashboardLayout({ kind }: { kind: Kind }) {
  const user = useDb((s) => s.me)!
  const shopName = useShopName()
  const unread = useDb((s) => s.notifications.filter((n) => n.scope === 'staff' && !n.read).length)
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [prevPath, setPrevPath] = useState(location.pathname)
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname)
    setOpen(false)
  }

  return (
    <div className="dash">
      <a className="skip-link" href="#dash-main">Перейти к содержимому</a>
      <aside className={`dash__side${open ? ' is-open' : ''}`} aria-label="Меню">
        <div className="dash__brand">
          <span className="dash__logo" aria-hidden>{shopName.slice(0, 1)}</span>
          <span style={{ minWidth: 0 }}>
            <span className="dash__shop">{shopName}</span>
            <span className="dash__kind">{kind === 'owner' ? 'Кабинет владельца' : 'Кабинет мастера'}</span>
          </span>
        </div>
        <nav className="dash__nav">
          {NAV[kind].map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="dash__link">
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.to === '/notifications' && unread > 0 && (
                <span className="dash__count" aria-label={`${unread} непрочитанных`}>{unread}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="dash__user">
          <Link to="/account" className="dash__profile" title="Мой аккаунт: смена пароля">
            <p className="dash__user-name">{[user.name, user.surname].filter(Boolean).join(' ') || user.email}</p>
            <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{ROLE_LABEL[user.role]} · аккаунт</p>
          </Link>
          <button className="btn btn--ghost btn--icon btn--sm" aria-label="Выйти" title="Выйти" onClick={() => void supabase.auth.signOut()}>
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      {open && <div className="dash__scrim" onClick={() => setOpen(false)} aria-hidden />}

      <div className="dash__body">
        <header className="dash__top">
          <span className="dash__top-shop">
            <span className="dash__logo dash__logo--sm" aria-hidden>{shopName.slice(0, 1)}</span>
            <span className="dash__shop">{shopName}</span>
          </span>
          <div className="dash__top-actions">
            <Link to="/notifications" className="btn btn--ghost btn--icon" aria-label={`Уведомления${unread ? `: ${unread} новых` : ''}`}>
              <Icon name="bell" />
              {unread > 0 && <span className="dash__dot" aria-hidden />}
            </Link>
            <Link to="/account" className="btn btn--ghost btn--icon dash__top-logout" aria-label="Мой аккаунт" title="Мой аккаунт">
              <Icon name="user" />
            </Link>
            <button className="btn btn--ghost btn--icon dash__top-logout" aria-label="Выйти" title="Выйти" onClick={() => void supabase.auth.signOut()}>
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <main id="dash-main" className="dash__main page-enter" key={location.pathname}>
          <Outlet />
        </main>
      </div>

      <nav className="dash-tabs" aria-label="Разделы">
        {NAV[kind].slice(0, TAB_COUNT[kind]).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="dash-tabs__item">
            <span className="dash-tabs__icon">
              <Icon name={n.icon} size={22} />
              {n.to === '/notifications' && unread > 0 && <span className="dash__dot" aria-hidden />}
            </span>
            <span>{n.label}</span>
          </NavLink>
        ))}
        {kind === 'owner' && (
          <button type="button" className={`dash-tabs__item${open ? ' active' : ''}`} aria-expanded={open} onClick={() => setOpen(true)}>
            <span className="dash-tabs__icon"><Icon name="menu" size={22} /></span>
            <span>Ещё</span>
          </button>
        )}
      </nav>
      <ScrollRestoration />
    </div>
  )
}
