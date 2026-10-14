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
        <div className="container hero__inner">
          <div className="hero__text">
            <h1 className="hero__title">{shopName}</h1>
            {settings.description ? (
              <p className="hero__lead">{settings.description}</p>
            ) : (
              <p className="hero__lead muted">Выберите мастера, услуги и удобное время — запись займёт пару минут.</p>
            )}
            <div className="row hero__cta">
              <Link to="/book" className="btn btn--book btn--lg">Записаться</Link>
              <Link to="/services" className="btn btn--lg">Услуги и цены</Link>
            </div>
            {settings.address && <p className="hero__address">{settings.address}</p>}
          </div>
          <div className="hero__visual">
            {settings.heroPhoto ? (
              <img src={settings.heroPhoto} alt={`Интерьер: ${shopName}`} className="hero__photo" />
            ) : (
              <div className="hero__photo photo-empty">Фото барбершопа появится после загрузки в настройках</div>
            )}
            <div className="hero__pole pole" aria-hidden />
          </div>
        </div>
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
            <Link to="/masters" className="section__more">Подробнее о мастерах</Link>
          </div>
          <div className="masters">
            {masters.slice(0, 3).map((m) => (
              <MasterCard key={m.id} master={m} />
            ))}
          </div>
        </section>
      )}

      <section className="container section home-facts" aria-label="Как проходит запись">
        <div>
          <h3>Запись онлайн в любое время</h3>
          <p className="muted">Видно реальное свободное время мастера, без звонков и ожидания ответа.</p>
        </div>
        <div>
          <h3>Цена известна заранее</h3>
          <p className="muted">Стоимость и длительность каждой услуги показаны до подтверждения записи.</p>
        </div>
        <div>
          <h3>Оплата на месте</h3>
          <p className="muted">Онлайн платить не нужно — расчёт в барбершопе после визита.</p>
        </div>
      </section>

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
