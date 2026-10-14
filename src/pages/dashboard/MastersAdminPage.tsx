import { useMemo, useState } from 'react'
import { useDb, type MasterInput } from '@/data/store'
import { usePageMeta } from '@/shared/seo'
import { dayKey } from '@/domain/tz'
import { EMPTY_SCHEDULE } from '@/data/defaults'
import { WEEK_ORDER, WEEKDAYS_FULL, formatDayMonth } from '@/domain/format'
import type { DayHours } from '@/domain/types'
import { workDaysText } from '@/features/catalog/MasterCard'
import { Avatar, Button, Checkbox, EmptyState, Field, Icon, Input, Modal, PhotoInput, Select, Textarea, useToast } from '@/shared/ui'

const blank: MasterInput = { name: '', specialization: '', bio: '', photo: null, active: true, serviceIds: [], schedule: EMPTY_SCHEDULE }

export default function MastersAdminPage() {
  usePageMeta('Мастера', '', { noindex: true })
  const masters = useDb((s) => s.masters)
  const timeOff = useDb((s) => s.timeOff)
  const appointments = useDb((s) => s.appointments)
  const saveMaster = useDb((s) => s.saveMaster)
  const setMasterActive = useDb((s) => s.setMasterActive)
  const setMasterUser = useDb((s) => s.setMasterUser)
  const users = useDb((s) => s.users)
  const staffUsers = useMemo(() => users.filter((u) => u.active && (u.role === 'barber' || u.role === 'owner')), [users])
  const addTimeOff = useDb((s) => s.addTimeOff)
  const removeTimeOff = useDb((s) => s.removeTimeOff)
  const toast = useToast()
  const [editing, setEditing] = useState<MasterInput | null>(null)
  const [offFor, setOffFor] = useState<string | 'all' | null>(null)
  const run = async (p: Promise<{ ok: boolean; error?: string }>, okText: string) => {
    const res = await p
    toast(res.ok ? okText : (res.error ?? 'Ошибка'), res.ok ? 'ok' : 'error')
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Мастера</h1>
          <p>Профили, услуги и расписание. Деактивация не удаляет историю записей. Барбер с привязанным аккаунтом видит в панели только свои записи.</p>
        </div>
        <div className="row">
          <Button onClick={() => setOffFor('all')}>Выходной для всех</Button>
          <Button variant="primary" onClick={() => setEditing(blank)}><Icon name="plus" /> Добавить мастера</Button>
        </div>
      </div>

      {masters.length === 0 ? (
        <EmptyState title="Мастеров пока нет" text="Добавьте мастера, назначьте услуги и рабочие часы — после этого откроется онлайн-запись." action={<Button variant="primary" onClick={() => setEditing(blank)}>Добавить мастера</Button>} />
      ) : (
        <div className="stack">
          {masters.map((m) => {
            const own = timeOff.filter((t) => t.masterId === m.id)
            const future = appointments.filter((a) => a.masterId === m.id && (a.status === 'pending' || a.status === 'confirmed') && new Date(a.startsAt) > new Date()).length
            return (
              <section key={m.id} className="panel" aria-label={m.name} style={{ opacity: m.active ? 1 : 0.65 }}>
                <div className="spread" style={{ alignItems: 'flex-start' }}>
                  <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <Avatar name={m.name} photo={m.photo} size={56} />
                    <div>
                      <h2 style={{ fontSize: 'var(--fs-md)' }}>{m.name} {!m.active && <span className="badge badge--cancelled">не работает</span>}</h2>
                      <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{m.specialization || 'Специализация не указана'}</p>
                      <p style={{ fontSize: 'var(--fs-sm)' }}>{workDaysText(m)}</p>
                      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Услуг: {m.serviceIds.length} · предстоящих записей: {future}</p>
                      <label className="row" style={{ gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', fontSize: 'var(--fs-sm)' }}>
                        <span className="muted">Аккаунт в панели</span>
                        <select
                          className="select"
                          style={{ width: 'auto', minHeight: 32, padding: '4px 8px' }}
                          value={m.userId ?? ''}
                          onChange={(e) => void run(setMasterUser(m.id, e.target.value || null), e.target.value ? 'Аккаунт привязан' : 'Аккаунт отвязан')}
                        >
                          <option value="">Не привязан</option>
                          {staffUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {[u.name, u.surname].filter(Boolean).join(' ') || u.email || 'Без имени'}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="row">
                    <Button size="sm" onClick={() => setOffFor(m.id)}>Отпуск / отгул</Button>
                    <Button size="sm" onClick={() => setEditing({ ...m })}><Icon name="edit" size={14} /> Изменить</Button>
                    <Button size="sm" variant={m.active ? 'danger' : 'default'} onClick={() => void run(setMasterActive(m.id, !m.active), m.active ? 'Мастер деактивирован' : 'Мастер снова работает')}>
                      {m.active ? 'Деактивировать' : 'Вернуть'}
                    </Button>
                  </div>
                </div>
                {own.length > 0 && (
                  <ul style={{ margin: 'var(--sp-3) 0 0', paddingLeft: '1.2em', fontSize: 'var(--fs-sm)' }}>
                    {own.map((t) => (
                      <li key={t.id}>
                        {formatDayMonth(t.from)}{t.to !== t.from && ` – ${formatDayMonth(t.to)}`}{t.reason && `: ${t.reason}`}{' '}
                        <button className="link-btn" onClick={() => void run(removeTimeOff(t.id), 'Удалено')}>убрать</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      {timeOff.some((t) => t.masterId === null) && (
        <section className="panel" aria-labelledby="shop-off">
          <h2 id="shop-off" style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--sp-3)' }}>Выходные барбершопа</h2>
          <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: 'var(--fs-sm)' }}>
            {timeOff.filter((t) => t.masterId === null).map((t) => (
              <li key={t.id}>
                {formatDayMonth(t.from)}{t.to !== t.from && ` – ${formatDayMonth(t.to)}`}{t.reason && `: ${t.reason}`}{' '}
                <button className="link-btn" onClick={() => void run(removeTimeOff(t.id), 'Удалено')}>убрать</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <MasterForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const res = await saveMaster(input)
            if (!res.ok) return res.error
            toast('Мастер сохранён')
            setEditing(null)
            return null
          }}
        />
      )}
      {offFor && (
        <TimeOffForm
          title={offFor === 'all' ? 'Выходной для всего барбершопа' : 'Отпуск или отгул'}
          onClose={() => setOffFor(null)}
          onSave={async (from, to, reason) => {
            const res = await addTimeOff({ masterId: offFor === 'all' ? null : offFor, from, to, reason })
            if (!res.ok) return res.error
            const conflicts = appointments.filter(
              (a) => (offFor === 'all' || a.masterId === offFor) && (a.status === 'pending' || a.status === 'confirmed') && dayKey(a.startsAt) >= from && dayKey(a.startsAt) <= to,
            ).length
            toast(conflicts ? `Сохранено. Внимание: на эти дни уже ${conflicts} записей — перенесите их вручную` : 'Сохранено', conflicts ? 'error' : 'ok')
            setOffFor(null)
            return null
          }}
        />
      )}
    </>
  )
}

function TimeOffForm({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (from: string, to: string, reason: string) => Promise<string | null> }) {
  const today = dayKey(new Date())
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  return (
    <Modal title={title} onClose={onClose} footer={<><Button onClick={onClose}>Отмена</Button><Button variant="primary" onClick={async () => setError((await onSave(from, to, reason)) ?? '')}>Сохранить</Button></>}>
      <div className="stack">
        <div className="form-grid form-grid--2">
          <Field label="С">{(p) => <Input {...p} type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} />}</Field>
          <Field label="По (включительно)">{(p) => <Input {...p} type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        <Field label="Причина" hint="Необязательно">{(p) => <Input {...p} value={reason} maxLength={80} onChange={(e) => setReason(e.target.value)} />}</Field>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Существующие записи автоматически не отменяются — о конфликтах мы предупредим.</p>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
      </div>
    </Modal>
  )
}

function MasterForm({ initial, onClose, onSave }: { initial: MasterInput; onClose: () => void; onSave: (v: MasterInput) => Promise<string | null> }) {
  const services = useDb((s) => s.services)
  const [v, setV] = useState<MasterInput>({ ...initial, schedule: [...initial.schedule] })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const setDay = (d: number, day: DayHours | null) => {
    const schedule = [...v.schedule]
    schedule[d] = day
    setV({ ...v, schedule })
  }
  const toggleService = (id: string) =>
    setV({ ...v, serviceIds: v.serviceIds.includes(id) ? v.serviceIds.filter((x) => x !== id) : [...v.serviceIds, id] })

  const submit = async () => {
    if (!v.name.trim()) return setError('Укажите имя мастера')
    for (const d of WEEK_ORDER) {
      const day = v.schedule[d]
      if (day && day.start >= day.end) return setError(`${WEEKDAYS_FULL[d]}: конец рабочего дня должен быть позже начала`)
      if (day?.breaks.some((b) => b.start >= b.end || b.start < day.start || b.end > day.end)) return setError(`${WEEKDAYS_FULL[d]}: перерыв должен быть внутри рабочего времени`)
    }
    setSaving(true)
    setError((await onSave(v)) ?? '')
    setSaving(false)
  }

  return (
    <Modal title={initial.id ? 'Профиль мастера' : 'Новый мастер'} onClose={onClose} wide footer={<><Button onClick={onClose}>Отмена</Button><Button variant="primary" loading={saving} onClick={() => void submit()}>Сохранить</Button></>}>
      <div className="stack" style={{ gap: 'var(--sp-5)' }}>
        <div className="form-grid form-grid--2">
          <Field label="Имя">{(p) => <Input {...p} value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Специализация">{(p) => <Input {...p} value={v.specialization} maxLength={60} onChange={(e) => setV({ ...v, specialization: e.target.value })} />}</Field>
          <Field label="О мастере" className="span-2">{(p) => <Textarea {...p} value={v.bio} maxLength={400} onChange={(e) => setV({ ...v, bio: e.target.value })} />}</Field>
        </div>
        <PhotoInput label="Фото мастера" value={v.photo} onChange={(photo) => setV({ ...v, photo })} />

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label" style={{ marginBottom: 'var(--sp-2)' }}>Услуги мастера</legend>
          {services.length === 0 ? <p className="muted">Сначала добавьте услуги в разделе «Услуги».</p> : (
            <div className="stack" style={{ gap: 'var(--sp-2)' }}>
              {services.map((s) => <Checkbox key={s.id} label={<>{s.name}{!s.active && <span className="muted"> (скрыта)</span>}</>} checked={v.serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} />)}
            </div>
          )}
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field__label" style={{ marginBottom: 'var(--sp-2)' }}>Рабочие дни и часы</legend>
          <div className="stack" style={{ gap: 'var(--sp-3)' }}>
            {WEEK_ORDER.map((d) => {
              const day = v.schedule[d]
              const br = day?.breaks[0]
              return (
                <div key={d} className="row" style={{ gap: 'var(--sp-3)' }}>
                  <label className="check" style={{ width: 150 }}>
                    <input type="checkbox" checked={!!day} onChange={(e) => setDay(d, e.target.checked ? { start: '10:00', end: '20:00', breaks: [] } : null)} />
                    <span>{WEEKDAYS_FULL[d]}</span>
                  </label>
                  {day ? (
                    <>
                      <Input aria-label={`${WEEKDAYS_FULL[d]}: начало`} type="time" style={{ width: 120 }} value={day.start} onChange={(e) => setDay(d, { ...day, start: e.target.value })} />
                      <span aria-hidden>–</span>
                      <Input aria-label={`${WEEKDAYS_FULL[d]}: конец`} type="time" style={{ width: 120 }} value={day.end} onChange={(e) => setDay(d, { ...day, end: e.target.value })} />
                      {br ? (
                        <>
                          <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>перерыв</span>
                          <Input aria-label="Начало перерыва" type="time" style={{ width: 120 }} value={br.start} onChange={(e) => setDay(d, { ...day, breaks: [{ ...br, start: e.target.value }] })} />
                          <Input aria-label="Конец перерыва" type="time" style={{ width: 120 }} value={br.end} onChange={(e) => setDay(d, { ...day, breaks: [{ ...br, end: e.target.value }] })} />
                          <Button size="sm" variant="ghost" onClick={() => setDay(d, { ...day, breaks: [] })}>Убрать</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setDay(d, { ...day, breaks: [{ start: '14:00', end: '15:00' }] })}>+ Перерыв</Button>
                      )}
                    </>
                  ) : <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Выходной</span>}
                </div>
              )
            })}
          </div>
        </fieldset>

        <Field label="Статус">
          {(p) => (
            <Select {...p} value={v.active ? '1' : '0'} onChange={(e) => setV({ ...v, active: e.target.value === '1' })}>
              <option value="1">Работает, доступен для записи</option>
              <option value="0">Не работает (история сохраняется)</option>
            </Select>
          )}
        </Field>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
      </div>
    </Modal>
  )
}

