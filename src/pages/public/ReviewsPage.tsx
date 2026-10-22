import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '@/data/store'
import { usePageMeta } from '@/shared/seo'
import { formatDate } from '@/domain/format'
import { ReviewItem } from '@/features/reviews/ReviewsBlock'
import { Button, EmptyState, Field, Select, StarsInput, Textarea, useToast } from '@/shared/ui'
import '@/features/reviews/reviews.css'

export default function ReviewsPage() {
  usePageMeta('Отзывы', 'Отзывы клиентов барбершопа.')
  const reviews = useDb((s) => s.reviews)
  const published = useMemo(() => reviews.filter((r) => r.status === 'published'), [reviews])

  return (
    <div className="container">
      <header className="page-head">
        <h1>Отзывы</h1>
        <p>Отзывы с сайта публикуются после проверки. У отзывов с карт указан источник и ссылка на оригинал.</p>
      </header>
      <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
        {published.length ? (
          <div className="reviews-grid">
            {published.map((r) => (
              <ReviewItem key={r.id} review={r} />
            ))}
          </div>
        ) : (
          <EmptyState title="Отзывов пока нет" text="Здесь появятся отзывы клиентов после первых визитов." />
        )}
        <ReviewForm />
      </div>
    </div>
  )
}

function ReviewForm() {
  const client = useDb((s) => s.client)
  const appointments = useDb((s) => s.appointments)
  const clientAddReview = useDb((s) => s.clientAddReview)
  const toast = useToast()
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  // Из «Моих записей» можно прийти сразу с нужной записью
  const [apptId, setApptId] = useState(() => new URLSearchParams(window.location.search).get('appointment') ?? '')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  // Отзыв доступен только по своей завершённой записи без отзыва
  const eligible = useMemo(
    () =>
      client ? appointments.filter((a) => a.status === 'completed' && !a.hasReview) : [],
    [appointments, client],
  )

  return (
    <section className="panel" aria-labelledby="review-form" style={{ maxWidth: 640 }}>
      <h2 id="review-form" style={{ fontSize: 'var(--fs-lg)', marginBottom: 'var(--sp-3)' }}>
        Оставить отзыв
      </h2>
      {!client ? (
        <p className="muted">
          Отзыв могут оставить клиенты после визита. Откройте <Link to="/me">«Мои записи»</Link> по имени и телефону, чтобы продолжить.
        </p>
      ) : sent ? (
        <div className="alert alert--ok">Спасибо! Отзыв отправлен на проверку и появится после модерации.</div>
      ) : !eligible.length ? (
        <p className="muted">Оставить отзыв можно после завершённой записи. Сейчас таких записей без отзыва нет.</p>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            setError('')
            const id = apptId || eligible[0]!.id
            const res = await clientAddReview({ rating, text, appointmentId: id })
            if (!res.ok) return setError(res.error)
            setSent(true)
            toast('Отзыв отправлен на проверку')
          }}
        >
          {eligible.length > 1 && (
            <Field label="Визит">
              {(p) => (
                <Select {...p} value={apptId || eligible[0]!.id} onChange={(e) => setApptId(e.target.value)}>
                  {eligible.map((a) => (
                    <option key={a.id} value={a.id}>
                      №{a.number}, {formatDate(a.startsAt)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <div className="field">
            <span className="field__label">Оценка</span>
            <StarsInput value={rating} onChange={setRating} />
          </div>
          <Field label="Отзыв" hint={`${text.trim().length}/1000, минимум 10 символов`}>
            {(p) => <Textarea {...p} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />}
          </Field>
          {error && <div className="alert alert--error" role="alert">{error}</div>}
          <div>
            <Button type="submit" variant="primary" disabled={!rating}>
              Отправить отзыв
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
