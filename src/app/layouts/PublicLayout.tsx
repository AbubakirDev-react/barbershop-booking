import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { useDb } from '@/data/store'
import { useShopName } from '@/data/hooks'
import { Icon } from '@/shared/ui'
import './public-layout.css'

const NAV = [
  { to: '/services', label: 'Услуги' },
  { to: '/masters', label: 'Мастера' },
  { to: '/reviews', label: 'Отзывы' },
  { to: '/about', label: 'Контакты' },
]

export function PublicLayout() {
  const shopName = useShopName()
  const client = useDb((s) => s.client)
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const onBookPage = location.pathname.startsWith('/book')
  // На «Моих записях» своя кнопка записи — общие не дублируем
  const onMePage = location.pathname.startsWith('/me')

  // Пока на экране кнопка «Записаться» из первого экрана главной, вторую не показываем
  const [heroCtaInView, setHeroCtaInView] = useState(false)
  useEffect(() => {
    const el = document.getElementById('hero-cta')
    if (!el) return
    const io = new IntersectionObserver(([e]) => setHeroCtaInView(e!.isIntersecting), { rootMargin: '-64px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [location.pathname])
  const showBookButton = !onBookPage && !onMePage && !(location.pathname === '/' && heroCtaInView)

  // Закрываем мобильное меню при переходе на другую страницу
  const [prevPath, setPrevPath] = useState(location.pathname)
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname)
    setMenuOpen(false)
  }

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  // Без регистрации: «Мои записи» — это записи, сделанные с этого устройства
  const accountLink = '/me'
  const accountLabel = client ? client.name : 'Мои записи'

  return (
    <div className="site">
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand" aria-label={`${shopName} — на главную`}>
            <span className="brand__mark pole" aria-hidden />
            <span className="brand__name">{shopName}</span>
          </Link>

          <nav className="site-nav" aria-label="Основная навигация">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="site-nav__link">
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="site-header__actions">
            <Link to={accountLink} className="btn btn--ghost site-header__account" aria-label={accountLabel}>
              <Icon name="user" />
              <span>{accountLabel}</span>
            </Link>
            {showBookButton && (
              <Link to="/book" className="btn btn--book site-header__book">
                Записаться
              </Link>
            )}
            <button
              className="btn btn--ghost btn--icon site-header__burger"
              aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} size={22} />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="mobile-menu" id="mobile-menu">
          <nav className="container" aria-label="Мобильная навигация">
            <NavLink to="/" end className="mobile-menu__link">Главная</NavLink>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="mobile-menu__link">
                {n.label}
              </NavLink>
            ))}
            <NavLink to={accountLink} className="mobile-menu__link">{accountLabel}</NavLink>
          </nav>
        </div>
      )}

      <main id="main" className="site-main">
        <Outlet />
      </main>

      <SiteFooter />

      {showBookButton && (
        <div className="book-bar">
          <Link to="/book" className="btn btn--book btn--lg btn--block">
            Записаться
          </Link>
        </div>
      )}
      <ScrollRestoration />
    </div>
  )
}

function SiteFooter() {
  const settings = useDb((s) => s.settings)
  const shopName = useShopName()
  const year = new Date().getFullYear()
  return (
    <footer className="site-footer">
      <div className="pole pole--thin" aria-hidden />
      <div className="container site-footer__inner">
        <div className="stack" style={{ gap: 'var(--sp-2)' }}>
          <p className="brand__name">{shopName}</p>
          {settings.address && <p className="muted">{settings.address}</p>}
          {settings.phone && (
            <a href={`tel:${settings.phone.replace(/[^+\d]/g, '')}`} className="site-footer__phone">
              {settings.phone}
            </a>
          )}
        </div>
        <nav className="site-footer__nav" aria-label="Ссылки в подвале">
          <Link to="/services">Услуги</Link>
          <Link to="/masters">Мастера</Link>
          <Link to="/reviews">Отзывы</Link>
          <Link to="/about">Контакты</Link>
          <Link to="/book">Онлайн-запись</Link>
        </nav>
        <p className="muted site-footer__copy">© {year} {shopName}. Оплата услуг — в барбершопе.</p>
      </div>
    </footer>
  )
}
