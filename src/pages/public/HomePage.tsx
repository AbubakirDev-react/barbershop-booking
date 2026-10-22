import { Link } from 'react-router-dom'
import { useDb } from '@/data/store'
import { usePublicMasters, usePublicServices, useShopName } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { ServiceList } from '@/features/catalog/ServiceList'
import { MasterCard } from '@/features/catalog/MasterCard'
import { ShopHours } from '@/features/catalog/ShopHours'
import { ReviewsBlock } from '@/features/reviews/ReviewsBlock'
import { ContactBlock } from '@/features/catalog/ContactBlock'
import { EmptyState } from '@/shared/ui'
import { useLocalBusinessSchema } from '@/shared/schema'
import { formatRub } from '@/domain/format'
import './home.css'

export default function HomePage() {
  const settings = useDb((s) => s.settings)
  const shopName = useShopName()
  const services = usePublicServices()
  const masters = usePublicMasters()
  usePageMeta('', settings.description || 'Онлайн-запись к мастеру: услуги, цены, свободное время.')
  useLocalBusinessSchema()

  const popular = services.slice(0, 5)
  const isEmpty = !services.length && !masters.length

  return (
    <>
      <section className="hero">
        <div className={`container hero__inner${settings.heroPhoto ? '' : ' hero__inner--solo'}`}>
          <div className="hero__text">
            {/* Название появляется по словам — единственная «большая» анимация страницы */}
            <h1 className="hero__title" aria-label={shopName}>
              {shopName.split(' ').map((w, i) => (
                <span key={i} className="hero__word" style={{ ['--i' as string]: i }} aria-hidden>
                  {w}{' '}
                </span>
              ))}
            </h1>
            <p className="hero__lead reveal" style={{ ['--d' as string]: '350ms' }}>
              {settings.description || 'Выберите мастера, услуги и удобное время — запись за минуту, без регистрации.'}
            </p>
            <div id="hero-cta" className="row hero__cta reveal" style={{ ['--d' as string]: '450ms' }}>
              <Link to="/book" className="btn btn--book btn--lg">Записаться</Link>
              <Link to="/services" className="btn btn--lg">Услуги и цены</Link>
            </div>
            {settings.address && <p className="hero__address reveal" style={{ ['--d' as string]: '550ms' }}>{settings.address}</p>}
          </div>
          {/* Без фото блок не показываем: пустая заглушка — лишняя информация */}
          {settings.heroPhoto && (
            <div className="hero__visual reveal" style={{ ['--d' as string]: '200ms' }}>
              <img src={settings.heroPhoto} alt={`Интерьер: ${shopName}`} className="hero__photo" />
              <div className="hero__pole pole" aria-hidden />
            </div>
          )}
        </div>
        {services.length > 0 && <ServiceTicker services={services} />}
      </section>

      {isEmpty && (
        <section className="container section">
          <EmptyState
            title="Сайт готовится к открытию записи"
            text="Услуги и мастера ещё не добавлены. Владелец может сделать это в панели управления."
          />
        </section>
      )}

      {popular.length > 0 && (
        <section className="container section" aria-labelledby="home-services">
          <div className="section__head">
            <h2 id="home-services">Услуги</h2>
            <Link to="/services" className="section__more">Все услуги</Link>
          </div>
          <ServiceList services={popular} showDescription={false} />
        </section>
      )}

      {masters.length > 0 && (
        <section className="container section" aria-labelledby="home-masters">
          <div className="section__head">
            <h2 id="home-masters">Мастера</h2>
            <Link to="/masters" className="section__more">Все мастера</Link>
          </div>
          <div className="masters">
            {masters.slice(0, 3).map((m) => (
              <MasterCard key={m.id} master={m} withBooking={false} />
            ))}
          </div>
        </section>
      )}

      <ReviewsBlock limit={3} />

      <section className="container section home-contacts" aria-labelledby="home-contacts">
        <div>
          <h2 id="home-contacts">Как нас найти</h2>
          <ContactBlock />
        </div>
        <div>
          <h3 style={{ marginBottom: 'var(--sp-3)' }}>Часы работы</h3>
          <ShopHours />
        </div>
      </section>
    </>
  )
}

/** Бегущая строка с услугами и ценами: двойной набор для бесшовной петли */
function ServiceTicker({ services }: { services: { id: string; name: string; price: number }[] }) {
  const items = services.slice(0, 10)
  return (
    <div className="ticker" aria-hidden>
      <div className="ticker__track">
        {[...items, ...items].map((s, i) => (
          <span key={`${s.id}-${i}`} className="ticker__item">
            {s.name} <b>{formatRub(s.price)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}
