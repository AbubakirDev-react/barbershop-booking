import { useMemo, useState } from 'react'
import { subDays, addDays } from 'date-fns'
import { usePageMeta } from '@/shared/seo'
import { dayKey } from '@/domain/tz'
import { APPOINTMENT_STATUSES } from '@/domain/types'
import { STATUS_LABEL } from '@/domain/statuses'
import { formatDateTime, formatRub } from '@/domain/format'
import { ManualBookingModal } from '@/features/dashboard/ManualBookingModal'
import { useAppointmentModal, useStaffAppointments, useStaffMasters } from '@/features/dashboard/staff'
import { Button, EmptyState, Field, Icon, Input, Select, StatusBadge } from '@/shared/ui'

const PAGE_SIZE = 20

export default function AppointmentsPage() {
  usePageMeta('Записи', '', { noindex: true })
  const appointments = useStaffAppointments()
  const masters = useStaffMasters()
  const { open, modal } = useAppointmentModal()
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState('all')
  const [masterId, setMasterId] = useState('all')
  const [from, setFrom] = useState(() => dayKey(subDays(new Date(), 7)))
  const [to, setTo] = useState(() => dayKey(addDays(new Date(), 30)))
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return appointments
      .filter((a) => {
        const day = dayKey(a.startsAt)
        if (from && day < from) return false
        if (to && day > to) return false
        if (status !== 'all' && a.status !== status) return false
        if (masterId !== 'all' && a.masterId !== masterId) return false
        if (q) {
          const byName = a.clientName.toLowerCase().includes(q)
          const byPhone = digits.length >= 3 && a.clientPhone.replace(/\D/g, '').includes(digits)
          const byNumber = String(a.number) === q.replace('№', '')
          if (!byName && !byPhone && !byNumber) return false
        }
        return true
      })
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  }, [appointments, status, masterId, from, to, query])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const masterName = (id: string) => masters.find((m) => m.id === id)?.name ?? '—'
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0) }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Записи</h1>
          <p>Найдено: {filtered.length}</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} disabled={!masters.length}>
          <Icon name="plus" /> Новая запись
        </Button>
      </div>

      <div className="toolbar">
        <Field label="Поиск">{(p) => <Input {...p} placeholder="Имя, телефон или №" value={query} onChange={(e) => resetPage(setQuery)(e.target.value)} />}</Field>
        <Field label="Статус">
          {(p) => (
            <Select {...p} value={status} onChange={(e) => resetPage(setStatus)(e.target.value)}>
              <option value="all">Все</option>
              {APPOINTMENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          )}
        </Field>
        {masters.length > 1 && (
          <Field label="Мастер">
            {(p) => (
              <Select {...p} value={masterId} onChange={(e) => resetPage(setMasterId)(e.target.value)}>
                <option value="all">Все</option>
                {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="С">{(p) => <Input {...p} type="date" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} />}</Field>
        <Field label="По">{(p) => <Input {...p} type="date" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} />}</Field>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Записей не найдено" text="Измените фильтры или период." />
      ) : (
        <div className="panel panel--flush table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>№</th>
                <th>Дата и время</th>
                <th>Клиент</th>
                <th>Мастер</th>
                <th>Услуги</th>
                <th className="right">Сумма</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} onClick={() => open(a.id)} style={{ cursor: 'pointer' }}>
                  <td className="num">
                    <button className="link-btn" onClick={(e) => { e.stopPropagation(); open(a.id) }}>{a.number}</button>
                  </td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(a.startsAt)}</td>
                  <td>
                    {a.clientName}
                    <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{a.clientPhone}</div>
                  </td>
                  <td>{masterName(a.masterId)}</td>
                  <td style={{ maxWidth: 260 }}>{a.items.map((i) => i.serviceName).join(', ')}</td>
                  <td className="right num">{formatRub(a.total)}</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <Button size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Назад</Button>
          <span className="muted num" style={{ fontSize: 'var(--fs-sm)' }}>{current + 1} из {pages}</span>
          <Button size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Вперёд</Button>
        </div>
      )}
      {modal}
      {creating && <ManualBookingModal onClose={() => setCreating(false)} />}
    </>
  )
}
