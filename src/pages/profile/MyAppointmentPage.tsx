import { Link, useParams } from 'react-router-dom'
import { useDb } from '@/data/store'
import { useCurrentUser } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { AppointmentActions, AppointmentDetails } from '@/features/appointments/AppointmentDetails'
import { EmptyState, Icon } from '@/shared/ui'

export default function MyAppointmentPage() {
  const { id } = useParams()
  const user = useCurrentUser()!
  const appt = useDb((s) => s.appointments.find((a) => a.id === id))
  const hasReview = useDb((s) => s.reviews.some((r) => r.appointmentId === id))
  usePageMeta(appt ? `Запись №${appt.number}` : 'Запись', '', { noindex: true })

  // Чужие записи выглядят как несуществующие — не раскрываем сам факт записи
  if (!appt || appt.clientUserId !== user.id) {
    return (
      <EmptyState
        title="Запись не найдена"
        text="Возможно, ссылка устарела или запись принадлежит другому аккаунту."
        action={<Link className="btn" to="/profile/appointments">К моим записям</Link>}
      />
    )
  }

  return (
    <>
      <Link to="/profile/appointments" className="row muted" style={{ textDecoration: 'none', fontSize: 'var(--fs-sm)' }}>
        <Icon name="chevronLeft" size={16} /> Мои записи
      </Link>
      <div className="panel">
        <AppointmentDetails appt={appt} />
      </div>
      <AppointmentActions appt={appt} />
      {appt.status === 'completed' && !hasReview && (
        <div className="alert">
          <span>
            Как прошёл визит? <Link to="/reviews">Оставьте отзыв</Link> — он появится после проверки.
          </span>
        </div>
      )}
    </>
  )
}
