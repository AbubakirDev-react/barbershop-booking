import { useDb } from '@/data/store'
import { Icon } from '@/shared/ui'

export function ContactBlock() {
  const s = useDb((st) => st.settings)
  const links = [
    { href: s.links.yandexMaps, label: 'Яндекс Карты' },
    { href: s.links.twoGis, label: '2ГИС' },
    { href: s.links.telegram, label: 'Telegram' },
    { href: s.links.instagram, label: 'Instagram' },
  ].filter((l) => l.href)

  if (!s.address && !s.phone && !links.length) {
    return <p className="muted">Контакты пока не указаны.</p>
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-3)' }}>
      {s.address && (
        <p className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <Icon name="pin" />
          <span>{s.address}</span>
        </p>
      )}
      {s.phone && (
        <p className="row">
          <Icon name="phone" />
          <a href={`tel:${s.phone.replace(/[^+\d]/g, '')}`} style={{ fontWeight: 600 }}>
            {s.phone}
          </a>
        </p>
      )}
      {links.length > 0 && (
        <div className="row">
          {links.map((l) => (
            <a key={l.label} className="btn btn--sm" href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label}
              <Icon name="external" size={14} />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
