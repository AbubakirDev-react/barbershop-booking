import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useDb } from '@/data/store'
import { formatRub, formatTime } from '@/domain/format'
import { inShopTz } from '@/domain/tz'
import type { Appointment } from '@/domain/types'
import { StatusBadge } from '@/shared/ui'
import './appointments.css'

/** Компактная строка записи; по клику открывается подробный вид */
export function AppointmentRow({
  appt,
  onOpen,
  showClient,
  showDate = true,
}: {
  appt: Appointment
  onOpen: () => void
  showClient?: boolean
  showDate?: boolean
}) {
  const master = useDb((s) => s.masters.find((m) => m.id === appt.masterId))
  return (
    <button type="button" className="appt-row" onClick={onOpen}>
      <span className="appt-row__time num">
        {formatTime(appt.startsAt)}
        {showDate && <small>{format(inShopTz(appt.startsAt), 'd MMM', { locale: ru })}</small>}
      </span>
      <span className="appt-row__main">
        <span className="appt-row__title">
          {showClient ? appt.clientName : appt.items.map((i) => i.serviceName).join(', ')}
        </span>
        <span className="appt-row__meta">
          №{appt.number} · {master?.name ?? '—'}
          {showClient && ` · ${appt.items.map((i) => i.serviceName).join(', ')}`}
        </span>
      </span>
      <span className="appt-row__side">
        <StatusBadge status={appt.status} />
        <span className="num" style={{ fontSize: 'var(--fs-sm)' }}>{formatRub(appt.total)}</span>
      </span>
    </button>
  )
}
