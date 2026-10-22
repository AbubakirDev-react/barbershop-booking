import { useState } from 'react'
import { useDb } from '@/data/store'
import { supabase } from '@/data/supabase'
import { usePageMeta } from '@/shared/seo'
import { Button, Field, Input, useToast } from '@/shared/ui'

const ROLE: Record<string, string> = { owner: 'Владелец', barber: 'Мастер', client: 'Без роли' }

/**
 * Свой аккаунт сотрудника: смена пароля. Сюда же ведёт ссылка
 * «Забыли пароль?» из письма (Supabase открывает сессию восстановления).
 */
export default function AccountPage() {
  usePageMeta('Мой аккаунт', '', { noindex: true })
  const me = useDb((s) => s.me)!
  const toast = useToast()
  const recovery = new URLSearchParams(window.location.search).has('recovery')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Пароль — не короче 8 символов')
    if (/^(\d)\1+$|^12345678|^password|^qwerty/i.test(password)) return setError('Слишком простой пароль — его легко подобрать')
    if (password !== repeat) return setError('Пароли не совпадают')
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) return setError(/same/i.test(err.message) ? 'Новый пароль совпадает со старым' : 'Не удалось сменить пароль. Попробуйте ещё раз')
    setPassword('')
    setRepeat('')
    toast('Пароль изменён')
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Мой аккаунт</h1>
          <p>{me.email} · {ROLE[me.role]}</p>
        </div>
      </div>
      {recovery && <div className="alert alert--warn">Вы вошли по ссылке восстановления — задайте новый пароль.</div>}
      <form className="panel stack" style={{ maxWidth: 480 }} onSubmit={submit} noValidate>
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>Сменить пароль</h2>
        <Field label="Новый пароль" hint="Не короче 8 символов">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Повторите пароль">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
        </Field>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <div>
          <Button type="submit" variant="primary" loading={busy}>Сохранить пароль</Button>
        </div>
      </form>
    </>
  )
}
