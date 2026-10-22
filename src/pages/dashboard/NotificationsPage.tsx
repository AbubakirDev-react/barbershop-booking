import { useState } from 'react'
import { useDb } from '@/data/store'
import { usePageMeta } from '@/shared/seo'
import { formatDateTime } from '@/domain/format'
import { useAppointmentModal } from '@/features/dashboard/staff'
import { Button, EmptyState } from '@/shared/ui'

export default function NotificationsPage() {
  usePageMeta('Уведомления', '', { noindex: true })
  const all = useDb((s) => s.notifications)
  const markRead = useDb((s) => s.markRead)
  const markAllRead = useDb((s) => s.markAllRead)
  const { open, modal } = useAppointmentModal()
  const [onlyUnread, setOnlyUnread] = useState(false)

  const staff = all.filter((n) => n.scope === 'staff')
  const list = onlyUnread ? staff.filter((n) => !n.read) : staff
  const unread = staff.filter((n) => !n.read).length

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Уведомления</h1>
          <p>Непрочитанных: {unread}</p>
        </div>
        <Button onClick={() => void markAllRead('staff')} disabled={!unread}>Отметить все прочитанными</Button>
      </div>
      <div className="segmented" aria-label="Фильтр">
        <button aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>Все</button>
        <button aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)}>Непрочитанные</button>
      </div>
      {list.length === 0 ? (
        <EmptyState title="Уведомлений нет" text="Здесь появятся новые онлайн-записи, отмены и переносы." />
      ) : (
        <ul className="panel panel--flush" style={{ listStyle: 'none', margin: 0 }}>
          {list.map((n) => (
            <li key={n.id} className="spread" style={{ padding: 'var(--sp-4)', borderBottom: '1px solid var(--c-line)', background: n.read ? undefined : 'var(--c-steel-soft)' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: n.read ? 500 : 700 }}>{n.title}</p>
                <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{n.body} · {formatDateTime(n.createdAt)}</p>
              </div>
              <div className="row">
                {n.appointmentId && (
                  <Button size="sm" onClick={() => { void markRead(n.id); open(n.appointmentId!) }}>Открыть запись</Button>
                )}
                {!n.read && <Button size="sm" variant="ghost" onClick={() => void markRead(n.id)}>Прочитано</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {modal}
    </>
  )
}
