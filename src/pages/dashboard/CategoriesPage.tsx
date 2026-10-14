import { useState } from 'react'
import { useDb } from '@/data/store'
import { useSortedCategories } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { pluralize } from '@/domain/format'
import type { Category } from '@/domain/types'
import { Button, ConfirmDialog, EmptyState, Field, Icon, Input, Modal, useToast } from '@/shared/ui'

export default function CategoriesPage() {
  usePageMeta('Категории', '', { noindex: true })
  const categories = useSortedCategories()
  const services = useDb((s) => s.services)
  const saveCategory = useDb((s) => s.saveCategory)
  const removeCategory = useDb((s) => s.removeCategory)
  const moveCategory = useDb((s) => s.moveCategory)
  const toast = useToast()
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const run = async (p: Promise<{ ok: boolean; error?: string }>, okText?: string) => {
    const res = await p
    if (!res.ok) toast(res.error ?? 'Ошибка', 'error')
    else if (okText) toast(okText)
  }

  const count = (id: string) => services.filter((s) => s.categoryId === id).length

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Категории</h1>
          <p>Группируют услуги в прайсе и при записи.</p>
        </div>
        <Button variant="primary" onClick={() => { setError(''); setEditing({ name: '' }) }}><Icon name="plus" /> Добавить</Button>
      </div>
      {categories.length === 0 ? (
        <EmptyState title="Категорий нет" text="Услуги будут показываться одним списком без групп." />
      ) : (
        <ul className="panel panel--flush" style={{ listStyle: 'none', margin: 0 }}>
          {categories.map((c, i) => {
            const n = count(c.id)
            return (
              <li key={c.id} className="spread" style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--c-line)' }}>
                <div>
                  <p style={{ fontWeight: 600 }}>{c.name}</p>
                  <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{n} {pluralize(n, 'услуга', 'услуги', 'услуг')}</p>
                </div>
                <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                  <Button size="sm" variant="ghost" icon disabled={i === 0} aria-label="Выше" onClick={() => void run(moveCategory(c.id, -1))}><Icon name="chevronUp" /></Button>
                  <Button size="sm" variant="ghost" icon disabled={i === categories.length - 1} aria-label="Ниже" onClick={() => void run(moveCategory(c.id, 1))}><Icon name="chevronDown" /></Button>
                  <Button size="sm" variant="ghost" icon aria-label={`Переименовать ${c.name}`} onClick={() => { setError(''); setEditing({ id: c.id, name: c.name }) }}><Icon name="edit" /></Button>
                  <Button size="sm" variant="ghost" icon aria-label={`Удалить ${c.name}`} onClick={() => setDeleting(c)}><Icon name="trash" /></Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {editing && (
        <Modal
          title={editing.id ? 'Переименовать категорию' : 'Новая категория'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>Отмена</Button>
              <Button
                variant="primary"
                loading={saving}
                onClick={async () => {
                  setSaving(true)
                  const res = await saveCategory(editing)
                  setSaving(false)
                  if (!res.ok) return setError(res.error)
                  toast('Категория сохранена')
                  setEditing(null)
                }}
              >
                Сохранить
              </Button>
            </>
          }
        >
          <Field label="Название" error={error}>
            {(p) => <Input {...p} value={editing.name} maxLength={40} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}
          </Field>
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Удалить «${deleting.name}»?`}
          text={count(deleting.id) ? `${count(deleting.id)} услуг останутся без категории — сами услуги не удаляются.` : 'Категория пуста, услуги не затронуты.'}
          confirmLabel="Удалить"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => { const id = deleting.id; setDeleting(null); void run(removeCategory(id), 'Категория удалена') }}
        />
      )}
    </>
  )
}
