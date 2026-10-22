import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { useDb } from '@/data/store'
import { usePublicMasters, usePublicServices, useShopName, useSortedCategories } from '@/data/hooks'
import { formatRub } from '@/domain/format'
import { Icon, type IconName } from '@/shared/ui'
import './public-layout.css'

const NAV = [
  { to: '/masters', label: 'Мастера' },
  { to: '/reviews', label: 'Отзывы' },
  { to: '/about', label: 'Контакты' },
]

/** Нижняя панель вкладок на телефоне вместо меню-бургера */
const TABS: { to: string; label: string; icon: IconName; end?: boolean; book?: boolean }[] = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/services', label: 'Услуги', icon: 'scissors' },
  { to: '/book', label: 'Записаться', icon: 'calendar', book: true },
  { to: '/masters', label: 'Мастера', icon: 'users' },
  { to: '/me', label: 'Мои записи', icon: 'user' },
]

export function PublicLayout() {
  const shopName = useShopName()
  const client = useDb((s) => s.client)
  const location = useLocation()
  const onBookPage = location.pathname.startsWith('/book')
  const onMePage = location.pathname.startsWith('/me')

  // Пока на экране кнопка «Записаться» из первого экрана главной, в шапке её не дублируем
  const [heroCtaInView, setHeroCtaInView] = useState(false)
  useEffect(() => {
    const el = document.getElementById('hero-cta')
    if (!el) return
    const io = new IntersectionObserver(([e]) => setHeroCtaInView(e!.isIntersecting), { rootMargin: '-64px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [location.pathname])
  const showHeaderBook = !onBookPage && !onMePage && !(location.pathname === '/' && heroCtaInView)

  return (
    <div className={`site${onBookPage ? ' site--no-tabs' : ''}`}>
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand" aria-label={`${shopName} — на главную`}>
            <span className="brand__mark pole" aria-hidden />
            <span className="brand__name">{shopName}</span>
          </Link>

          <nav className="site-nav" aria-label="Основная навигация">
            <MegaMenu key={location.pathname} />
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="site-nav__link">
                {n.label}
              </NavLink>
            ))}
          </nav>

          {/* В записи нет вкладок — даём явный выход, чтобы клиент не «застрял» */}
          {onBookPage && (
            <Link to="/" className="btn btn--ghost btn--sm book-exit" aria-label="Закрыть запись и вернуться на главную">
              <Icon name="close" size={16} /> Закрыть
            </Link>
          )}

          <div className="site-header__actions">
            <Link to="/me" className="btn btn--ghost site-header__account" aria-label={client ? client.name : 'Мои записи'}>
              <Icon name="user" />
              <span>{client ? client.name : 'Мои записи'}</span>
            </Link>
            {showHeaderBook && (
              <Link to="/book" className="btn btn--book site-header__book">
                Записаться
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="site-main">
        <Outlet />
      </main>

      <SiteFooter />

      {/* На странице записи внизу своя панель выбора — вкладки бы её перекрыли */}
      {!onBookPage && (
        <nav className="tabbar" aria-label="Разделы">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={`tabbar__item${t.book ? ' tabbar__item--book' : ''}`}>
              <span className="tabbar__icon"><Icon name={t.icon} size={t.book ? 22 : 20} /></span>
              <span className="tabbar__label">{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <ScrollRestoration />
    </div>
  )
}

/**
 * Мега-меню «Услуги»: по наведению или клику раскрывается панель с разделами
 * прайса, мастерами и контактами. Закрывается по Escape, уходу курсора и переходу.
 */
function MegaMenu() {
  const services = usePublicServices()
  const categories = useSortedCategories()
  const masters = usePublicMasters()
  const settings = useDb((s) => s.settings)
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)

  const groups = useMemo(
    () =>
      categories
        .map((c) => ({ id: c.id, name: c.name, items: services.filter((s) => s.categoryId === c.id) }))
        .filter((g) => g.items.length),
    [categories, services],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const show = () => {
    window.clearTimeout(closeTimer.current)
    setOpen(true)
  }
  // Небольшая задержка, чтобы панель не закрывалась, пока курсор идёт к ней
  const hide = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 160)
  }

  return (
    <div className="mega" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        className={`site-nav__link mega__trigger${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls="mega-panel"
        onClick={() => setOpen((v) => !v)}
      >
        Услуги <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="mega__panel" id="mega-panel" role="region" aria-label="Услуги и мастера">
          <div className="mega__cols">
            {groups.map((g) => (
              <div key={g.id} className="mega__col">
                <p className="mega__title">{g.name}</p>
                <ul>
                  {g.items.slice(0, 5).map((s) => (
                    <li key={s.id}>
                      <Link to={`/book?service=${s.id}`} className="mega__link">
                        <span>{s.name}</span>
                        <b>{formatRub(s.price)}</b>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {masters.length > 0 && (
              <div className="mega__col">
                <p className="mega__title">Мастера</p>
                <ul>
                  {masters.map((m) => (
                    <li key={m.id}>
                      <Link to={`/book?master=${m.id}`} className="mega__link">
                        <span>{m.name}</span>
                        {m.specialization && <small>{m.specialization}</small>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="mega__aside">
            <p className="mega__title">Онлайн-запись</p>
            <p className="muted">Без регистрации, за минуту.</p>
            <Link to="/book" className="btn btn--book btn--block">Записаться</Link>
            <Link to="/services" className="mega__all">Все услуги и цены →</Link>
            {settings.address && <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{settings.address}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function SiteFooter() {
  const phone = useDb((s) => s.settings.phone)
  const shopName = useShopName()
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <span className="muted">© {new Date().getFullYear()} {shopName}</span>
        {phone && (
          <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="site-footer__phone">
            {phone}
          </a>
        )}
      </div>
    </footer>
  )
}
