import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useDb } from '@/data/store'
import { supabase } from '@/data/supabase'
import { usePageMeta } from '@/shared/seo'
import { Button, Field, Input } from '@/shared/ui'
import type { StaffKind } from './StaffGate'
import './staff.css'

const TITLE: Record<StaffKind, string> = { owner: 'Кабинет владельца', master: 'Кабинет мастера' }

/** Понятные сообщения вместо английских ошибок Supabase Auth */
function authError(message: string): string {
  if (/invalid login/i.test(message)) return 'Неверный email или пароль'
  if (/not confirmed/i.test(message)) return 'Подтвердите email: ссылка пришла в письме'
  if (/already registered/i.test(message)) return 'Такой email уже зарегистрирован — войдите'
  if (/password/i.test(message)) return 'Пароль — не короче 6 символов'
  if (/rate limit/i.test(message)) return 'Слишком много попыток. Подождите немного'
  return 'Не удалось войти. Проверьте данные и повторите'
}

export default function StaffLoginPage({ kind }: { kind: StaffKind }) {
  usePageMeta(TITLE[kind], '', { noindex: true })
  const me = useDb((s) => s.me)
  const shopName = useDb((s) => s.settings.name) || 'Барбершоп'
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (me) return <Navigate to="/" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    if (mode === 'in') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) setError(authError(err.message))
    } else {
      if (name.trim().length < 2) {
        setBusy(false)
        return setError('Укажите имя')
      }
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() }, emailRedirectTo: window.location.href.replace(/login\/?$/, '') },
      })
      if (err) setError(authError(err.message))
      else if (!data.session) setInfo('Мы отправили письмо для подтверждения email. Откройте ссылку из письма и войдите.')
    }
    setBusy(false)
  }

  return (
    <main className="staff-auth">
      <form className="staff-auth__card stack" onSubmit={submit} noValidate>
        <p className="staff-auth__shop">{shopName}</p>
        <h1>{TITLE[kind]}</h1>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'in'} onClick={() => setMode('in')}>Вход</button>
          <button type="button" role="tab" aria-selected={mode === 'up'} onClick={() => setMode('up')}>Новый сотрудник</button>
        </div>
        {mode === 'up' && (
          <Field label="Имя">{(p) => <Input {...p} value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />}</Field>
        )}
        <Field label="Email">{(p) => <Input {...p} type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Пароль" hint={mode === 'up' ? 'Не короче 6 символов' : undefined}>
          {(p) => (
            <Input {...p} type="password" value={password} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        {info && <div className="alert alert--ok" role="status">{info}</div>}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {mode === 'in' ? 'Войти' : 'Создать аккаунт'}
        </Button>
        {mode === 'up' && (
          <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
            После регистрации владелец выдаст вам доступ в разделе «Пользователи».
          </p>
        )}
      </form>
    </main>
  )
}
