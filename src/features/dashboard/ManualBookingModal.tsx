import { useMemo, useState } from 'react'
import { useDb } from '@/data/store'
import { calcTotals, MAX_SERVICES_PER_APPOINTMENT, toItem } from '@/domain/pricing'
import { formatDuration, formatRub } from '@/domain/format'
import { SlotPicker } from '@/features/booking/SlotPicker'
import { Button, Field, Input, Modal, Select, useToast } from '@/shared/ui'
import { nameSchema, normalizePhone, phoneSchema } from '@/shared/validation'
import { useStaffMasters } from './staff'

/**
 * Ручная запись клиента без регистрации. Источник — manual, статус сразу
 * «подтверждена». Клиентские уведомления не отправляются: создание записи
 * барбером не означает согласия клиента на рассылку.
 */
export function ManualBookingModal({ onClose }: { onClose: () => void }) {
  const masters = useStaffMasters()
  const services = useDb((s) => s.services)
  const createAppointment = useDb((s) => s.createAppointment)
  const toast = useToast()

  const [requestId] = useState(() => crypto.randomUUID())
  const [masterId, setMasterId] = useState(masters[0]?.id ?? '')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const master = masters.find((m) => m.id === masterId)
  const offered = useMemo(
    () => services.filter((s) => s.active && master?.serviceIds.includes(s.id)).sort((a, b) => a.order - b.order),
    [services, master],
  )
  const chosen = offered.filter((s) => serviceIds.includes(s.id))
  const totals = calcTotals(chosen.map(toItem))

  const submit = async () => {
    const errs: Record<string, string> = {}
    const n = nameSchema.safeParse(name)
    if (!n.success) errs.name = n.error.issues[0]!.message
    const p = phoneSchema.safeParse(phone)
    if (!p.success) errs.phone = p.error.issues[0]!.message
    if (!chosen.length) errs.services = 'Выберите хотя бы одну услугу'
    if (!startsAt) errs.time = 'Выберите время'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    const res = await createAppointment({
      requestId,
      masterId,
      serviceIds,
      startsAt: startsAt!,
      clientName: name,
      clientPhone: normalizePhone(phone),
      note,
      source: 'manual',
    })
    setSaving(false)
    if (!res.ok) return setErrors({ form: res.error })
    toast(`Запись №${res.value.number} создана`)
    onClose()
  }

  return (
    <Modal
      title="Новая запись"
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>Создать запись</Button>
        </>
      }
    >
      {masters.length === 0 ? (
        <p>Нет активных мастеров. Добавьте мастера в разделе «Мастера».</p>
      ) : (
        <div className="stack" style={{ gap: 'var(--sp-5)' }}>
          <div className="form-grid form-grid--2">
            <Field label="Имя клиента" error={errors.name}>
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
            </Field>
            <Field label="Телефон" error={errors.phone}>
              {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />}
            </Field>
            <Field label="Мастер" className="span-2">
              {(p) => (
                <Select
                  {...p}
                  value={masterId}
                  onChange={(e) => {
                    setMasterId(e.target.value)
                    setServiceIds([])
                    setStartsAt(null)
                  }}
                >
                  {masters.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field__label" style={{ marginBottom: 'var(--sp-2)' }}>
              Услуги (до {MAX_SERVICES_PER_APPOINTMENT})
            </legend>
            {offered.length === 0 ? (
              <p className="muted">У мастера нет назначенных услуг.</p>
            ) : (
              <div className="stack" style={{ gap: 'var(--sp-2)' }}>
                {offered.map((s) => {
                  const on = serviceIds.includes(s.id)
                  return (
                    <label key={s.id} className="check">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && serviceIds.length >= MAX_SERVICES_PER_APPOINTMENT}
                        onChange={() => {
                          setServiceIds(on ? serviceIds.filter((x) => x !== s.id) : [...serviceIds, s.id])
                          setStartsAt(null)
                        }}
                      />
                      <span>
                        {s.name} <span className="muted">· {formatDuration(s.durationMinutes)} · {formatRub(s.price)}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            {errors.services && <p className="field__error">{errors.services}</p>}
          </fieldset>

          {master && chosen.length > 0 && (
            <div className="stack" style={{ gap: 'var(--sp-3)' }}>
              <p className="field__label">
                Время <span className="muted">· {formatDuration(totals.durationMinutes)}, {formatRub(totals.total)}</span>
              </p>
              <SlotPicker
                key={`${master.id}-${totals.durationMinutes}`}
                master={master}
                durationMinutes={totals.durationMinutes}
                value={startsAt}
                onChange={setStartsAt}
                staffMode
              />
              {errors.time && <p className="field__error">{errors.time}</p>}
            </div>
          )}

          <Field label="Примечание" hint="Необязательно, видно только сотрудникам">
            {(p) => <Input {...p} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {errors.form && <div className="alert alert--error" role="alert">{errors.form}</div>}
        </div>
      )}
    </Modal>
  )
}
