import { useMemo, useState } from 'react'
import { useDb } from '@/data/store'
import { useCurrentUser } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { formatDate } from '@/domain/format'
import type { Role } from '@/domain/types'
import { AppointmentRow } from '@/features/appointments/AppointmentRow'
import { useAppointmentModal } from '@/features/dashboard/staff'
import { Button, EmptyState, Field, Input, Modal, Select, useToast } from '@/shared/ui'

const ROLE_LABEL: Record<Role, string> = { client: 'Клиент', barber: 'Барбер', owner: 'Владелец' }

export default function UsersPage() {
  usePageMeta('Сотрудники', '', { noindex: true })
  const me = useCurrentUser()!
  const users = useDb((s) => s.users)
  const appointments = useDb((s) => s.appointments)
  const setUserRole = useDb((s) => s.setUserRole)
  const setUserActive = useDb((s) => s.setUserActive)
  const toast = useToast()
  const { open, modal } = useAppointmentModal()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return users.filter((u) => {
      if (role !== 'all' && u.role !== role) return false
      if (!q) return true
      return (
        `${u.name} ${u.surname}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (digits.length >= 3 && u.phone.replace(/\D/g, '').includes(digits))
      )
    })
  }, [users, query, role])

  const selected = users.find((u) => u.id === openId)
  const report = async (p: Promise<{ ok: boolean; error?: string }>, text: string) => {
    const res = await p
    if (res.ok) toast(text)
    else toast(res.error ?? 'Ошибка', 'error')
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Сотрудники</h1>
          <p>Роли и доступ к панели. Изменения проверяются при каждом действии.</p>
        </div>
      </div>
      <div className="toolbar">
        <Field label="Поиск">{(p) => <Input {...p} placeholder="Имя, email или телефон" value={query} onChange={(e) => setQuery(e.target.value)} />}</Field>
        <Field label="Роль">
          {(p) => (
            <Select {...p} value={role} onChange={(e) => setRole(e.target.value as Role | 'all')}>
              <option value="all">Все</option>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          )}
        </Field>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Пользователей не найдено" />
      ) : (
        <div className="panel panel--flush table-wrap">
          <table className="table">
            <thead><tr><th>Пользователь</th><th>Контакты</th><th>Роль</th><th>Доступ</th><th className="right">Записи</th></tr></thead>
            <tbody>
              {list.map((u) => {
                const isMe = u.id === me.id
                return (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                    <td>
                      <button className="link-btn" onClick={() => setOpenId(u.id)}>{u.name} {u.surname}</button>
                      {isMe && <span className="badge badge--plain" style={{ marginLeft: 8 }}>это вы</span>}
                      <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>с {formatDate(u.createdAt)}</div>
                    </td>
                    <td style={{ fontSize: 'var(--fs-sm)' }}>{u.phone || '—'}<div className="muted">{u.email || ''}</div></td>
                    <td>
                      <Select
                        aria-label={`Роль: ${u.name}`}
                        style={{ minHeight: 34, width: 'auto' }}
                        value={u.role}
                        disabled={isMe}
                        title={isMe ? 'Свою роль менять нельзя — чтобы не потерять доступ' : undefined}
                        onChange={(e) => void report(setUserRole(u.id, e.target.value as Role), 'Роль изменена')}
                      >
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </Select>
                    </td>
                    <td>
                      <Button size="sm" disabled={isMe} onClick={() => void report(setUserActive(u.id, !u.active), u.active ? 'Доступ отключён' : 'Доступ включён')}>
                        {u.active ? 'Отключить' : 'Включить'}
                      </Button>
                    </td>
                    <td className="right num">{appointments.filter((a) => a.clientUserId === u.id).length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && !modal && (
        <Modal title={`${selected.name} ${selected.surname}`} onClose={() => setOpenId(null)} wide>
          <div className="stack">
            <dl className="dl">
              <dt>Роль</dt><dd>{ROLE_LABEL[selected.role]}</dd>
              <dt>Телефон</dt><dd>{selected.phone || '—'}</dd>
              <dt>Email</dt><dd>{selected.email || '—'}</dd>
              <dt>Напоминания</dt><dd>{selected.prefs.reminders ? `Да, ${selected.prefs.channel === 'email' ? 'email' : 'Telegram'}` : 'Нет'}</dd>
            </dl>
            <h3 style={{ fontSize: 'var(--fs-md)' }}>Записи клиента</h3>
            {appointments.filter((a) => a.clientUserId === selected.id).length === 0 ? (
              <p className="muted">Записей нет.</p>
            ) : (
              <div className="panel panel--flush">
                {appointments.filter((a) => a.clientUserId === selected.id).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map((a) => (
                  <AppointmentRow key={a.id} appt={a} onOpen={() => open(a.id)} />
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
      {modal}
    </>
  )
}
