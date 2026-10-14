import { Link } from 'react-router-dom'
import { usePageMeta } from '@/shared/seo'

export default function NotFoundPage() {
  usePageMeta('Страница не найдена', '', { noindex: true })
  return (
    <section className="container" style={{ padding: 'var(--sp-9) var(--sp-4)' }}>
      <div className="stack" style={{ maxWidth: '52ch' }}>
        <p className="muted num" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-3xl)' }}>404</p>
        <h1>Такой страницы нет</h1>
        <p className="muted">Возможно, ссылка устарела или в адресе опечатка.</p>
        <div className="row">
          <Link className="btn btn--primary" to="/">На главную</Link>
          <Link className="btn btn--book" to="/book">Записаться</Link>
        </div>
      </div>
    </section>
  )
}
