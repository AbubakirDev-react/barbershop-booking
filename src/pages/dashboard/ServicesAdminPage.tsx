import { useState } from 'react'
import { useDb, type ServiceInput } from '@/data/store'
import { useSortedCategories } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { formatDuration, formatRub } from '@/domain/format'
import type { Service } from '@/domain/types'
import { Button, Checkbox, ConfirmDialog, EmptyState, Field, Icon, Input, Modal, PhotoInput, Select, Textarea, useToast } from '@/shared/ui'

const blank: ServiceInput = { name: '', description: '', categoryId: null, price: 0, durationMinutes: 30, active: true, photo: null }

export default function ServicesAdminPage() {
  usePageMeta('Услуги', '', { noindex: true })
  const services = useDb((s) => s.services)
  const categories = useSortedCategories()
  const moveService = useDb((s) => s.moveService)
  const removeService = useDb((s) => s.removeService)
  const saveService = useDb((s) => s.saveService)
  const toast = useToast()
  const [editing, setEditing] = useState<ServiceInput | null>(null)
  const [deleting, setDeleting] = useState<Service | null>(null)
  const move = async (id: string, dir: -1 | 1) => {
    const res = await moveService(id, dir)
    if (!res.ok) toast(res.error, 'error')
  }

  const sorted = [...services].sort((a, b) => a.order - b.order)
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Без категории'

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Услуги</h1>
          <p>Порядок здесь — порядок на сайте и при записи.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing(blank)}><Icon name="plus" /> Добавить услугу</Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="Услуг пока нет" text="Добавьте первую услугу с ценой и длительностью — она появится на сайте и в записи." action={<Button variant="primary" onClick={() => setEditing(blank)}>Добавить услугу</Button>} />
      ) : (
        <div className="panel panel--flush table-wrap">
          <table className="table">
            <thead>
              <tr><th>Услуга</th><th>Категория</th><th className="right">Цена</th><th className="right">Время</th><th>Статус</th><th className="right">Действия</th></tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.6 }}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{catName(s.categoryId)}</td>
                  <td className="right num">{formatRub(s.price)}</td>
                  <td className="right num">{formatDuration(s.durationMinutes)}</td>
                  <td>{s.active ? <span className="badge badge--completed">Показывается</span> : <span className="badge badge--cancelled">Скрыта</span>}</td>
                  <td className="right">
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 2, flexWrap: 'nowrap' }}>
                      <Button size="sm" variant="ghost" icon disabled={i === 0} aria-label="Выше" onClick={() => void move(s.id, -1)}><Icon name="chevronUp" /></Button>
                      <Button size="sm" variant="ghost" icon disabled={i === sorted.length - 1} aria-label="Ниже" onClick={() => void move(s.id, 1)}><Icon name="chevronDown" /></Button>
                      <Button size="sm" variant="ghost" icon aria-label={`Изменить ${s.name}`} onClick={() => setEditing({ ...s })}><Icon name="edit" /></Button>
                      <Button size="sm" variant="ghost" icon aria-label={`Удалить ${s.name}`} onClick={() => setDeleting(s)}><Icon name="trash" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ServiceForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const res = await saveService(input)
            if (!res.ok) return res.error
            toast(input.id ? 'Услуга сохранена' : 'Услуга добавлена')
            setEditing(null)
            return null
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Удалить «${deleting.name}»?`}
          text="Если по услуге уже были записи, она будет скрыта, а не удалена — история и цены в прошлых записях сохранятся."
          confirmLabel="Удалить"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const id = deleting.id
            setDeleting(null)
            const res = await removeService(id)
            if (res.ok) toast(res.value === 'archived' ? 'Услуга скрыта: по ней есть записи' : 'Услуга удалена')
            else toast(res.error, 'error')
          }}
        />
      )}
    </>
  )
}

function ServiceForm({ initial, onClose, onSave }: { initial: ServiceInput; onClose: () => void; onSave: (v: ServiceInput) => Promise<string | null> }) {
  const categories = useSortedCategories()
  const [v, setV] = useState({ ...initial, price: initial.price } as ServiceInput)
  const [price, setPrice] = useState(String(initial.price || ''))
  const [duration, setDuration] = useState(String(initial.durationMinutes))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const p = Number(price.replace(',', '.'))
    const d = Number(duration)
    if (!v.name.trim()) return setError('Укажите название')
    if (!Number.isFinite(p) || p < 0 || price === '') return setError('Укажите цену в рублях')
    if (!Number.isFinite(d) || d < 5 || d > 480) return setError('Длительность — от 5 до 480 минут')
    setSaving(true)
    setError((await onSave({ ...v, price: p, durationMinutes: d })) ?? '')
    setSaving(false)
  }

  return (
    <Modal
      title={initial.id ? 'Изменить услугу' : 'Новая услуга'}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Отмена</Button><Button variant="primary" loading={saving} onClick={() => void submit()}>Сохранить</Button></>}
    >
      <div className="stack">
        <Field label="Название">{(p) => <Input {...p} value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
        <Field label="Описание" hint="Необязательно">{(p) => <Textarea {...p} value={v.description} maxLength={300} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <div className="form-grid form-grid--2">
          <Field label="Категория">
            {(p) => (
              <Select {...p} value={v.categoryId ?? ''} onChange={(e) => setV({ ...v, categoryId: e.target.value || null })}>
                <option value="">Без категории</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <span />
          <Field label="Цена, ₽">{(p) => <Input {...p} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
          <Field label="Длительность, мин">{(p) => <Input {...p} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />}</Field>
        </div>
        <PhotoInput label="Фото услуги" value={v.photo} onChange={(photo) => setV({ ...v, photo })} />
        <Checkbox label="Показывать на сайте и в записи" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
        <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Мастеров, выполняющих услугу, назначают в разделе «Мастера».</p>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
      </div>
    </Modal>
  )
}
