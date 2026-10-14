import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useDb } from '@/data/store'
import { useCurrentUser } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { isActive } from '@/domain/statuses'
import { formatDateTime } from '@/domain/format'
import { normalizePhone, profileSchema, type ProfileForm } from '@/shared/validation'
import { AppointmentRow } from '@/features/appointments/AppointmentRow'
import { Button, EmptyState, Field, Input, useToast } from '@/shared/ui'

export default function ProfilePage() {
  usePageMeta('Профиль', '', { noindex: true })
  const user = useCurrentUser()!
  const appointments = useDb((s) => s.appointments)
  const notifications = useDb((s) => s.notifications)
  const markRead = useDb((s) => s.markRead)
  const navigate = useNavigate()

  const upcoming = useMemo(
    () =>
      appointments
        .filter((a) => a.clientUserId === user.id && isActive(a.status))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 3),
    [appointments, user.id],
  )
  const mine = notifications.filter((n) => n.scope === user.id).slice(0, 5)

  return (
    <>
      <h1>Профиль</h1>

      <section aria-labelledby="upcoming" className="stack">
        <div className="spread">
          <h2 id="upcoming" style={{ fontSize: 'var(--fs-lg)' }}>Ближайшие записи</h2>
          <Link to="/profile/appointments" className="section__more">Все записи</Link>
        </div>
        {upcoming.length ? (
          <div className="panel panel--flush">
            {upcoming.map((a) => (
              <AppointmentRow key={a.id} appt={a} onOpen={() => navigate(`/profile/appointments/${a.id}`)} />
            ))}
          </div>
        ) : (
          <EmptyState title="Предстоящих записей нет" action={<Link className="btn btn--book" to="/book">Записаться</Link>} />
        )}
      </section>

      {mine.length > 0 && (
        <section aria-labelledby="my-notifications" className="stack">
          <h2 id="my-notifications" style={{ fontSize: 'var(--fs-lg)' }}>Уведомления</h2>
          <ul className="panel" style={{ listStyle: 'none', margin: 0, display: 'grid', gap: 'var(--sp-3)' }}>
            {mine.map((n) => (
              <li key={n.id} className="spread" style={{ opacity: n.read ? 0.65 : 1 }}>
                <span>
                  <strong>{n.title}</strong> <span className="muted">· {formatDateTime(n.createdAt)}</span>
                  <br />
                  <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{n.body}</span>
                </span>
                {n.appointmentId && (
                  <Button size="sm" onClick={() => { void markRead(n.id); navigate(`/profile/appointments/${n.appointmentId}`) }}>
                    Открыть
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProfileForm />
    </>
  )
}

function ProfileForm() {
  const user = useCurrentUser()!
  const updateProfile = useDb((s) => s.updateProfile)
  const toast = useToast()
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, formState, reset } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, surname: user.surname, phone: user.phone, email: user.email },
  })
  const e = formState.errors

  return (
    <section aria-labelledby="personal" className="panel">
      <form
        className="stack"
        noValidate
        onSubmit={handleSubmit(async (data) => {
          const values = { name: data.name, surname: data.surname ?? '', email: data.email ?? '', phone: normalizePhone(data.phone) }
          const res = await updateProfile(values)
          if (!res.ok) return toast(res.error, 'error')
          reset(values)
          setSaved(true)
          toast('Профиль сохранён')
        })}
      >
        <h2 id="personal" style={{ fontSize: 'var(--fs-lg)' }}>Личные данные</h2>
        <div className="form-grid form-grid--2">
          <Field label="Имя" error={e.name?.message}>{(p) => <Input {...p} autoComplete="given-name" {...register('name')} />}</Field>
          <Field label="Фамилия" error={e.surname?.message}>{(p) => <Input {...p} autoComplete="family-name" {...register('surname')} />}</Field>
          <Field label="Телефон" error={e.phone?.message}>{(p) => <Input {...p} type="tel" autoComplete="tel" {...register('phone')} />}</Field>
          <Field label="Email" error={e.email?.message}>{(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}</Field>
        </div>
        <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
          Контакты видят только сотрудники барбершопа. Другим клиентам они не показываются.
        </p>
        <div className="row">
          <Button type="submit" variant="primary" loading={formState.isSubmitting} disabled={!formState.isDirty}>Сохранить</Button>
          {saved && !formState.isDirty && <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Сохранено</span>}
        </div>
      </form>
    </section>
  )
}
