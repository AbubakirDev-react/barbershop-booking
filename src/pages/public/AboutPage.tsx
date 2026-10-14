import { useDb } from '@/data/store'
import { useShopName } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { useLocalBusinessSchema } from '@/shared/schema'
import { ContactBlock } from '@/features/catalog/ContactBlock'
import { ShopHours } from '@/features/catalog/ShopHours'

export default function AboutPage() {
  const settings = useDb((s) => s.settings)
  const shopName = useShopName()
  usePageMeta('Контакты', settings.address ? `${shopName}: ${settings.address}` : 'Адрес, телефон и часы работы.')
  useLocalBusinessSchema()

  return (
    <div className="container">
      <header className="page-head">
        <h1>{shopName}</h1>
        {settings.description && <p>{settings.description}</p>}
      </header>
      <div className="home-contacts" style={{ display: 'grid', gap: 'var(--sp-7)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <section aria-labelledby="about-contacts" className="stack">
          <h2 id="about-contacts" style={{ fontSize: 'var(--fs-lg)' }}>Контакты</h2>
          <ContactBlock />
        </section>
        <section aria-labelledby="about-hours" className="stack">
          <h2 id="about-hours" style={{ fontSize: 'var(--fs-lg)' }}>Часы работы</h2>
          <ShopHours />
        </section>
        <section aria-labelledby="about-rules" className="stack">
          <h2 id="about-rules" style={{ fontSize: 'var(--fs-lg)' }}>Правила записи</h2>
          <ul className="muted" style={{ margin: 0, paddingLeft: '1.2em', display: 'grid', gap: 6 }}>
            <li>Оплата — в барбершопе, онлайн платить не нужно.</li>
            <li>Отменить запись онлайн можно не позднее чем за {settings.cancelBeforeHours} ч до начала.</li>
            <li>Перенести — не позднее чем за {settings.rescheduleBeforeHours} ч.</li>
            <li>Записаться можно не раньше чем за {Math.round(settings.minLeadMinutes / 60 * 10) / 10} ч и не дальше {settings.horizonDays} дн. вперёд.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
