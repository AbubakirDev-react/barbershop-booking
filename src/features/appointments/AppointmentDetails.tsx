import { useState } from 'react'
import { useDb, type Result } from '@/data/store'
import { useCurrentUser } from '@/data/hooks'
import { canReschedule, canTransition, STATUS_LABEL } from '@/domain/statuses'
import { formatDateTime, formatDuration, formatRub, formatTime } from '@/domain/format'
import type { Appointment, AppointmentStatus } from '@/domain/types'
import { SlotPicker } from '@/features/booking/SlotPicker'
import { Button, ConfirmDialog, Modal, StatusBadge, useToast } from '@/shared/ui'
import './appointments.css'

const ACTOR_LABEL = { client: 'клиент', barber: 'барбер', owner: 'владелец', system: 'система' } as const

export function AppointmentDetails({ appt, showClient }: { appt: Appointment; showClient?: boolean }) {
  const master = useDb((s) => s.masters.find((m) => m.id === appt.masterId))
  const address = useDb((s) => s.settings.address)
  return (
    <div className="appt-details">
      <div className="spread">
        <p className="appt-details__num num">Запись №{appt.number}</p>
        <StatusBadge status={appt.status} />
      </div>
      <dl className="dl">
        <dt>Дата и время</dt>
        <dd>
          {formatDateTime(appt.startsAt)}–{formatTime(appt.endsAt)}
        </dd>
        <dt>Мастер</dt>
        <dd>{master?.name ?? 'Мастер удалён'}{master && !master.active && ' (не работает)'}</dd>
        {showClient && (
          <>
            <dt>Клиент</dt>
            <dd>{appt.clientName}</dd>
            <dt>Телефон</dt>
            <dd><a href={`tel:${appt.clientPhone.replace(/[^+\d]/g, '')}`}>{appt.clientPhone}</a></dd>
            <dt>Источник</dt>
            <dd>{appt.source === 'online' ? 'Онлайн-запись' : 'Создана барбером'}</dd>
          </>
        )}
        <dt>Длительность</dt>
        <dd>{formatDuration(appt.durationMinutes)}</dd>
        {address && (
          <>
            <dt>Адрес</dt>
            <dd>{address}</dd>
          </>
        )}
        {appt.note && (
          <>
            <dt>Комментарий</dt>
            <dd>{appt.note}</dd>
          </>
        )}
      </dl>

      <table className="table appt-details__items">
        <caption className="visually-hidden">Услуги</caption>
        <thead>
          <tr>
            <th>Услуга</th>
            <th className="right">Время</th>
            <th className="right">Цена</th>
          </tr>
        </thead>
        <tbody>
          {appt.items.map((i) => (
            <tr key={i.serviceId}>
              <td>{i.serviceName}</td>
              <td className="right muted">{formatDuration(i.durationMinutes)}</td>
              <td className="right num">{formatRub(i.price)}</td>
            </tr>
          ))}
          <tr>
            <td><strong>Итого</strong></td>
            <td className="right muted">{formatDuration(appt.durationMinutes)}</td>
            <td className="right num"><strong>{formatRub(appt.total)}</strong></td>
          </tr>
        </tbody>
      </table>

      <details className="appt-details__history">
        <summary>История изменений ({appt.history.length})</summary>
        <ol>
          {[...appt.history].reverse().map((h, i) => (
            <li key={i}>
              <span className="muted num">{formatDateTime(h.at)}</span>{' '}
              {h.note ?? (h.from ? `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}` : `Создана: ${STATUS_LABEL[h.to]}`)}
              <span className="muted">
                {' '}
                ({ACTOR_LABEL[h.actor]}{h.actorName ? `, ${h.actorName}` : ''})
              </span>
              {h.reason && <div className="muted">Причина: {h.reason}</div>}
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}

const STAFF_ACTIONS: { to: AppointmentStatus; label: string; variant?: 'primary' | 'danger' }[] = [
  { to: 'confirmed', label: 'Подтвердить', variant: 'primary' },
  { to: 'in_progress', label: 'Начать обслуживание', variant: 'primary' },
  { to: 'completed', label: 'Завершить', variant: 'primary' },
  { to: 'no_show', label: 'Клиент не пришёл' },
  { to: 'cancelled', label: 'Отменить запись', variant: 'danger' },
]

/**
 * Кнопки показываются по тем же правилам canTransition, что проверяет
 * слой данных: интерфейс не предлагает действие, которое будет отклонено.
 */
export function AppointmentActions({ appt, onDone }: { appt: Appointment; onDone?: () => void }) {
  const user = useCurrentUser()
  const settings = useDb((s) => s.settings)
  const changeStatus = useDb((s) => s.changeStatus)
  const toast = useToast()
  const [confirm, setConfirm] = useState<AppointmentStatus | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [busy, setBusy] = useState<AppointmentStatus | null>(null)

  if (!user) return null
  const role = user.role
  const actions = STAFF_ACTIONS.filter((a) => canTransition(appt, a.to, role, settings).ok)
  const resched = canReschedule(appt, role, settings)
  const clientCancelBlocked =
    role === 'client' && (appt.status === 'pending' || appt.status === 'confirmed') && !canTransition(appt, 'cancelled', role, settings).ok

  const run = async (to: AppointmentStatus, reason?: string) => {
    setBusy(to)
    const res = await changeStatus(appt.id, to, reason)
    setBusy(null)
    report(res, `Статус: ${STATUS_LABEL[to].toLowerCase()}`)
  }
  const report = (res: Result, okText: string) => {
    if (res.ok) {
      toast(okText)
      onDone?.()
    } else toast(res.error, 'error')
  }

  if (!actions.length && !resched.ok && !clientCancelBlocked) return null

  return (
    <div className="appt-actions">
      {actions.map((a) =>
        a.to === 'cancelled' || a.to === 'no_show' ? (
          <Button key={a.to} variant={a.variant} loading={busy === a.to} disabled={busy !== null} onClick={() => setConfirm(a.to)}>
            {a.label}
          </Button>
        ) : (
          <Button key={a.to} variant={a.variant} loading={busy === a.to} disabled={busy !== null} onClick={() => void run(a.to)}>
            {a.label}
          </Button>
        ),
      )}
      {resched.ok && <Button onClick={() => setRescheduling(true)}>Перенести</Button>}
      {clientCancelBlocked && (
        <p className="muted" style={{ fontSize: 'var(--fs-sm)', flexBasis: '100%' }}>
          До начала меньше {settings.cancelBeforeHours} ч — отменить или перенести запись можно по телефону барбершопа.
        </p>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm === 'cancelled' ? 'Отменить запись?' : 'Отметить неявку?'}
          text={
            confirm === 'cancelled'
              ? `Запись №${appt.number} будет отменена, время освободится для других клиентов.`
              : `Запись №${appt.number} получит статус «Клиент не пришёл». Изменить это будет нельзя.`
          }
          confirmLabel={confirm === 'cancelled' ? 'Отменить запись' : 'Отметить неявку'}
          danger
          withReason
          onClose={() => setConfirm(null)}
          onConfirm={(reason) => {
            setConfirm(null)
            void run(confirm, reason || undefined)
          }}
        />
      )}
      {rescheduling && <RescheduleModal appt={appt} onClose={() => setRescheduling(false)} onDone={onDone} />}
    </div>
  )
}

function RescheduleModal({ appt, onClose, onDone }: { appt: Appointment; onClose: () => void; onDone?: () => void }) {
  const master = useDb((s) => s.masters.find((m) => m.id === appt.masterId))
  const reschedule = useDb((s) => s.reschedule)
  const user = useCurrentUser()
  const toast = useToast()
  const [value, setValue] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <Modal
      title={`Перенос записи №${appt.number}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Не переносить</Button>
          <Button
            variant="primary"
            disabled={!value}
            loading={saving}
            onClick={async () => {
              setSaving(true)
              const res = await reschedule(appt.id, value!)
              setSaving(false)
              if (!res.ok) return setError(res.error)
              toast('Запись перенесена')
              onClose()
              onDone?.()
            }}
          >
            Перенести
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">
          Сейчас: {formatDateTime(appt.startsAt)}. Длительность {formatDuration(appt.durationMinutes)} сохранится.
        </p>
        {master ? (
          <SlotPicker
            master={master}
            durationMinutes={appt.durationMinutes}
            value={value}
            onChange={setValue}
            ignoreAppointmentId={appt.id}
            staffMode={user?.role !== 'client'}
          />
        ) : (
          <p>Мастер недоступен — перенос невозможен.</p>
        )}
        {error && <div className="alert alert--error" role="alert">{error}</div>}
      </div>
    </Modal>
  )
}
