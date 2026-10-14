import { useMemo, useState } from 'react'
import { usePageMeta } from '@/shared/seo'
import { formatDate, formatRub } from '@/domain/format'
import type { Appointment } from '@/domain/types'
import { AppointmentRow } from '@/features/appointments/AppointmentRow'
import { useAppointmentModal, useStaffAppointments } from '@/features/dashboard/staff'
import { EmptyState, Field, Input, Modal } from '@/shared/ui'

interface ClientRow {
  key: string
  name: string
  phone: string
  registered: boolean
  visits: number
  noShows: number
  spent: number
  last: string | null
  appointments: Appointment[]
}

/**
 * Клиенты собираются из записей: ключ — телефон (для ручных записей другого
 * идентификатора нет). Учитываются только записи, доступные сотруднику.
 */
export default function ClientsPage() {
  usePageMeta('Клиенты', '', { noindex: true })
  const appointments = useStaffAppointments()
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const { open, modal } = useAppointmentModal()

  const clients = useMemo(() => {
    const map = new Map<string, ClientRow>()
    for (const a of appointments) {
      const key = a.clientPhone.replace(/\D/g, '').slice(-10) || a.clientName
      const row = map.get(key) ?? { key, name: a.clientName, phone: a.clientPhone, registered: false, visits: 0, noShows: 0, spent: 0, last: null, appointments: [] }
      row.appointments.push(a)
      if (a.clientUserId) row.registered = true
      if (a.status === 'completed') {
        row.visits++
        row.spent = Math.round((row.spent + a.total) * 100) / 100
        if (!row.last || a.startsAt > row.last) row.last = a.startsAt
      }
      if (a.status === 'no_show') row.noShows++
      map.set(key, row)
    }
    return [...map.values()].sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''))
  }, [appointments])

  const q = query.trim().toLowerCase()
  const digits = q.replace(/\D/g, '')
  const list = clients.filter((c) => !q || c.name.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)))
  const selected = clients.find((c) => c.key === openKey)

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Клиенты</h1>
          <p>Всего: {clients.length}</p>
        </div>
      </div>
      <div className="toolbar">
        <Field label="Поиск">{(p) => <Input {...p} placeholder="Имя или телефон" value={query} onChange={(e) => setQuery(e.target.value)} />}</Field>
      </div>
      {list.length === 0 ? (
        <EmptyState title={clients.length ? 'Никого не нашли' : 'Клиентов пока нет'} text={clients.length ? 'Проверьте имя или номер.' : 'Клиенты появятся после первых записей.'} />
      ) : (
        <div className="panel panel--flush table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Телефон</th>
                <th className="right">Визитов</th>
                <th className="right">Неявок</th>
                <th className="right">Сумма визитов</th>
                <th>Последний визит</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.key} onClick={() => setOpenKey(c.key)} style={{ cursor: 'pointer' }}>
                  <td>
                    <button className="link-btn" onClick={(e) => { e.stopPropagation(); setOpenKey(c.key) }}>{c.name}</button>
                    {c.registered && <span className="badge badge--plain" style={{ marginLeft: 8 }}>есть аккаунт</span>}
                  </td>
                  <td className="num">{c.phone}</td>
                  <td className="right num">{c.visits}</td>
                  <td className="right num">{c.noShows}</td>
                  <td className="right num">{formatRub(c.spent)}</td>
                  <td>{c.last ? formatDate(c.last) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && !modal && (
        <Modal title={selected.name} onClose={() => setOpenKey(null)} wide>
          <div className="stack">
            <p className="muted">{selected.phone} · визитов: {selected.visits} · неявок: {selected.noShows}</p>
            <div className="panel panel--flush">
              {[...selected.appointments].sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map((a) => (
                <AppointmentRow key={a.id} appt={a} onOpen={() => open(a.id)} />
              ))}
            </div>
          </div>
        </Modal>
      )}
      {modal}
    </>
  )
}
