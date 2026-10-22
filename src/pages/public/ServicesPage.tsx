import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePublicServices, useSortedCategories } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { ServiceList } from '@/features/catalog/ServiceList'
import { EmptyState } from '@/shared/ui'

export default function ServicesPage() {
  usePageMeta('Услуги и цены', 'Стрижки, борода и комплексы: цены в рублях и длительность каждой услуги.')
  const services = usePublicServices()
  const categories = useSortedCategories()
  const [filter, setFilter] = useState<string>('all')

  const groups = useMemo(() => {
    const list = categories
      .map((c) => ({ id: c.id, name: c.name, items: services.filter((s) => s.categoryId === c.id) }))
      .filter((g) => g.items.length)
    const other = services.filter((s) => !s.categoryId || !categories.some((c) => c.id === s.categoryId))
    if (other.length) list.push({ id: 'other', name: 'Другое', items: other })
    return list
  }, [services, categories])

  const visible = filter === 'all' ? groups : groups.filter((g) => g.id === filter)

  return (
    <div className="container">
      <header className="page-head">
        <h1>Услуги и цены</h1>
      </header>

      {groups.length === 0 ? (
        <EmptyState title="Услуги ещё не добавлены" text="Как только владелец опубликует прайс, он появится здесь." />
      ) : (
        <>
          {groups.length > 1 && (
            <div className="segmented" role="tablist" aria-label="Категории" style={{ marginBottom: 'var(--sp-6)' }}>
              <button role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>
                Все
              </button>
              {groups.map((g) => (
                <button key={g.id} role="tab" aria-selected={filter === g.id} onClick={() => setFilter(g.id)}>
                  {g.name}
                </button>
              ))}
            </div>
          )}
          {visible.map((g) => (
            <section key={g.id} aria-labelledby={`cat-${g.id}`}>
              <h2 id={`cat-${g.id}`} className="cat-heading">{g.name}</h2>
              <ServiceList
                services={g.items}
                renderAction={(s) => (
                  <Link to={`/book?service=${s.id}`} className="btn btn--sm" aria-label={`Записаться: ${s.name}`}>
                    Выбрать
                  </Link>
                )}
              />
            </section>
          ))}
        </>
      )}
    </div>
  )
}
