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
      </div>
    </div>
  )
}
