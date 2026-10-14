import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDb } from '@/data/store'
import { useCurrentUser } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import type { Appointment } from '@/domain/types'
import { AppointmentRow } from '@/features/appointments/AppointmentRow'
import { EmptyState } from '@/shared/ui'

const TABS: { id: string; label: string; match: (a: Appointment) => boolean; asc?: boolean }[] = [
  { id: 'upcoming', label: 'Предстоящие', match: (a) => a.status === 'confirmed' || a.status === 'in_progress', asc: true },
  { id: 'pending', label: 'Требуют подтверждения', match: (a) => a.status === 'pending', asc: true },
  { id: 'completed', label: 'Завершённые', match: (a) => a.status === 'completed' },
  { id: 'cancelled', label: 'Отменённые', match: (a) => a.status === 'cancelled' },
  { id: 'no_show', label: 'Пропущенные', match: (a) => a.status === 'no_show' },
]

export default function MyAppointmentsPage() {
  usePageMeta('Мои записи', '', { noindex: true })
  const user = useCurrentUser()!
  const all = useDb((s) => s.appointments)
  const navigate = useNavigate()
  const [tab, setTab] = useState('upcoming')

  const mine = useMemo(() => all.filter((a) => a.clientUserId === user.id), [all, user.id])
  const current = TABS.find((t) => t.id === tab)!
  const list = mine
    .filter(current.match)
    .sort((a, b) => (current.asc ? a.startsAt.localeCompare(b.startsAt) : b.startsAt.localeCompare(a.startsAt)))

  return (
    <>
      <h1>Мои записи</h1>
      <div className="segmented" role="tablist" aria-label="Статус записей">
        {TABS.map((t) => {
          const count = mine.filter(t.match).length
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}{count > 0 && ` · ${count}`}
            </button>
          )
        })}
      </div>
      {list.length ? (
        <div className="panel panel--flush" role="tabpanel">
          {list.map((a) => (
            <AppointmentRow key={a.id} appt={a} onOpen={() => navigate(`/profile/appointments/${a.id}`)} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Здесь пока пусто"
          text="Записи с этим статусом появятся здесь."
          action={tab === 'upcoming' || tab === 'pending' ? <Link className="btn btn--book" to="/book">Записаться</Link> : undefined}
        />
      )}
    </>
  )
}
