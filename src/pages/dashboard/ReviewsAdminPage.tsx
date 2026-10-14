import { useState } from 'react'
import { useDb } from '@/data/store'
import { usePageMeta } from '@/shared/seo'
import { formatDate } from '@/domain/format'
import type { ReviewSource, ReviewStatus } from '@/domain/types'
import { SOURCE_LABEL } from '@/features/reviews/ReviewsBlock'
import { Button, EmptyState, Field, Icon, Input, Modal, Select, Stars, StarsInput, Textarea, useToast } from '@/shared/ui'

const STATUS: Record<ReviewStatus, string> = { pending: 'На проверке', published: 'Опубликован', hidden: 'Скрыт' }

export default function ReviewsAdminPage() {
  usePageMeta('Отзывы', '', { noindex: true })
  const reviews = useDb((s) => s.reviews)
  const setStatus = useDb((s) => s.setReviewStatus)
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('pending')
  const [adding, setAdding] = useState(false)
  const toast = useToast()
  const setReview = async (id: string, status: ReviewStatus, okText: string) => {
    const res = await setStatus(id, status)
    toast(res.ok ? okText : res.error, res.ok ? 'ok' : 'error')
  }

  const list = filter === 'all' ? reviews : reviews.filter((r) => r.status === filter)

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Отзывы</h1>
          <p>Отзывы с сайта публикуются только после вашей проверки.</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}><Icon name="plus" /> Добавить отзыв вручную</Button>
      </div>
      <div className="segmented" role="group" aria-label="Фильтр">
        {(['pending', 'published', 'hidden', 'all'] as const).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Все' : STATUS[f]}{f !== 'all' && ` · ${reviews.filter((r) => r.status === f).length}`}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState title="Отзывов нет" text="Отзывы с сайта появятся после визитов клиентов. Отзывы с 2ГИС или Яндекс Карт можно добавить вручную — с указанием источника и ссылки." />
      ) : (
        <div className="stack">
          {list.map((r) => (
            <article key={r.id} className="panel">
              <div className="spread">
                <Stars value={r.rating} />
                <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                  {SOURCE_LABEL[r.source]} · {formatDate(r.createdAt)} · {STATUS[r.status]}
                </span>
              </div>
              <p style={{ margin: 'var(--sp-3) 0', maxWidth: '70ch' }}>{r.text}</p>
              <div className="spread">
                <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
                  {r.authorName}
                  {r.sourceUrl && <> · <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">источник</a></>}
                </span>
                <div className="row">
                  {r.status !== 'published' && <Button size="sm" variant="primary" onClick={() => void setReview(r.id, 'published', 'Отзыв опубликован')}>Опубликовать</Button>}
                  {r.status !== 'hidden' && <Button size="sm" onClick={() => void setReview(r.id, 'hidden', 'Отзыв скрыт')}>Скрыть</Button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {adding && <ManualReviewModal onClose={() => setAdding(false)} />}
    </>
  )
}

function ManualReviewModal({ onClose }: { onClose: () => void }) {
  const addManualReview = useDb((s) => s.addManualReview)
  const toast = useToast()
  const [authorName, setAuthorName] = useState('')
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [source, setSource] = useState<ReviewSource>('2gis')
  const [sourceUrl, setSourceUrl] = useState('')
  const [error, setError] = useState('')

  return (
    <Modal
      title="Добавить отзыв вручную"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const res = await addManualReview({ authorName, rating, text, source, sourceUrl })
              if (!res.ok) return setError(res.error)
              toast('Отзыв добавлен')
              onClose()
            }}
          >
            Добавить
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="alert alert--warn">Добавляйте только реальные отзывы с сохранением автора и смысла. Без ссылки на источник отзыв не сохранится.</div>
        <Field label="Автор">{(p) => <Input {...p} value={authorName} onChange={(e) => setAuthorName(e.target.value)} />}</Field>
        <div className="field"><span className="field__label">Оценка</span><StarsInput value={rating} onChange={setRating} /></div>
        <Field label="Текст отзыва">{(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
        <div className="form-grid form-grid--2">
          <Field label="Источник">
            {(p) => (
              <Select {...p} value={source} onChange={(e) => setSource(e.target.value as ReviewSource)}>
                <option value="2gis">2ГИС</option>
                <option value="yandex">Яндекс Карты</option>
                <option value="manual">Другой источник</option>
              </Select>
            )}
          </Field>
          <Field label="Ссылка на отзыв">{(p) => <Input {...p} type="url" placeholder="https://" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />}</Field>
        </div>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
      </div>
    </Modal>
  )
}
