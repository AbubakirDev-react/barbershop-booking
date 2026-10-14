import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '@/data/store'
import { formatDate } from '@/domain/format'
import type { Review } from '@/domain/types'
import { Stars } from '@/shared/ui'
import './reviews.css'

export const SOURCE_LABEL: Record<Review['source'], string> = {
  site: 'Отзыв на сайте',
  '2gis': '2ГИС',
  yandex: 'Яндекс Карты',
  manual: 'Другой источник',
}

export function ReviewItem({ review }: { review: Review }) {
  return (
    <article className="review">
      <div className="spread">
        <Stars value={review.rating} />
        <span className="muted review__date">{formatDate(review.createdAt)}</span>
      </div>
      <p className="review__text">{review.text}</p>
      <p className="review__author">
        {review.authorName}
        <span className="muted">
          {' — '}
          {review.sourceUrl ? (
            <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer">
              {SOURCE_LABEL[review.source]}
            </a>
          ) : (
            SOURCE_LABEL[review.source]
          )}
          {review.source === 'site' && review.appointmentId && ', визит подтверждён'}
        </span>
      </p>
    </article>
  )
}

/**
 * На главной показываем только опубликованные отзывы на 4–5 звёзд — как
 * требует план. Это отдельная подборка, а не общий рейтинг, поэтому
 * средний балл здесь не выводится.
 */
export function ReviewsBlock({ limit }: { limit: number }) {
  const reviews = useDb((s) => s.reviews)
  const shown = useMemo(
    () => reviews.filter((r) => r.status === 'published' && r.rating >= 4).slice(0, limit),
    [reviews, limit],
  )
  if (!shown.length) return null
  return (
    <section className="container section" aria-labelledby="home-reviews">
      <div className="section__head">
        <h2 id="home-reviews">Отзывы</h2>
        <Link to="/reviews" className="section__more">Все отзывы</Link>
      </div>
      <div className="reviews-grid">
        {shown.map((r) => (
          <ReviewItem key={r.id} review={r} />
        ))}
      </div>
    </section>
  )
}
