import type { ReactNode } from 'react'
import { formatDuration, formatRub } from '@/domain/format'
import type { Service } from '@/domain/types'
import './catalog.css'

/**
 * Услуги показываются как прайс-лист на стене барбершопа:
 * название — точечная линия — длительность и цена. Без карточек.
 */
export function ServiceList({
  services,
  renderAction,
  showDescription = true,
}: {
  services: Service[]
  renderAction?: (s: Service) => ReactNode
  showDescription?: boolean
}) {
  return (
    <ul className="price-list">
      {services.map((s) => (
        <li key={s.id} className="price-list__item">
          {s.photo && <img className="price-list__photo" src={s.photo} alt={s.name} loading="lazy" />}
          <div className="price-list__main">
            <div className="price-list__line">
              <span className="price-list__name">{s.name}</span>
              <span className="price-list__dots" aria-hidden />
              <span className="price-list__price num">{formatRub(s.price)}</span>
            </div>
            <div className="price-list__meta">
              <span className="muted">{formatDuration(s.durationMinutes)}</span>
              {showDescription && s.description && <span className="price-list__desc">{s.description}</span>}
            </div>
          </div>
          {renderAction && <div className="price-list__action">{renderAction(s)}</div>}
        </li>
      ))}
    </ul>
  )
}
