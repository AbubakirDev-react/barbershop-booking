import { useState } from 'react'
import { useDb, type ClientInfo } from '@/data/store'
import { Button, Field, Input } from '@/shared/ui'
import { nameSchema, phoneSchema } from '@/shared/validation'

/**
 * Вход без регистрации: имя + телефон. Новый номер — создаётся клиент,
 * знакомый номер — открываются его записи (имя должно совпасть).
 */
export function ClientLoginForm({
  submitLabel = 'Продолжить',
  onDone,
}: {
  submitLabel?: string
  onDone?: (client: ClientInfo) => void
}) {
  const clientLogin = useDb((s) => s.clientLogin)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<{ name?: string; phone?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = nameSchema.safeParse(name)
    const p = phoneSchema.safeParse(phone)
    const next = {
      name: n.success ? undefined : n.error.issues[0]!.message,
      phone: p.success ? undefined : p.error.issues[0]!.message,
    }
    setErrors(next)
    if (next.name || next.phone) return
    setBusy(true)
    const res = await clientLogin(name, phone)
    setBusy(false)
    if (!res.ok) return setErrors({ form: res.error })
    onDone?.(res.value)
  }

  return (
    <form className="client-login stack" onSubmit={submit} noValidate>
      <div className="form-grid form-grid--2">
        <Field label="Имя" error={errors.name}>
          {(p) => <Input {...p} value={name} autoComplete="given-name" placeholder="Как к вам обращаться" onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Телефон" error={errors.phone}>
          {(p) => <Input {...p} type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 123-45-67" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
      </div>
      {errors.form && <div className="alert alert--error" role="alert">{errors.form}</div>}
      <Button type="submit" variant="book" size="lg" loading={busy}>
        {submitLabel}
      </Button>
      <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
        Без регистрации и паролей. Если вы уже записывались — укажите то же имя и номер.
      </p>
    </form>
  )
}
