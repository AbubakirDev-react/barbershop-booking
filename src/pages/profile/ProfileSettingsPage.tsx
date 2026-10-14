import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClerk } from '@clerk/clerk-react'
import { useDb } from '@/data/store'
import { useCurrentUser } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import type { UserPrefs } from '@/domain/types'
import { Button, Checkbox, ConfirmDialog, useToast } from '@/shared/ui'

export default function ProfileSettingsPage() {
  usePageMeta('Настройки профиля', '', { noindex: true })
  const user = useCurrentUser()!
  const updatePrefs = useDb((s) => s.updatePrefs)
  const deleteProfile = useDb((s) => s.deleteProfile)
  const claimFirstOwner = useDb((s) => s.claimFirstOwner)
  const clerk = useClerk()
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const p = user.prefs

  const save = async (patch: Partial<UserPrefs>) => {
    const res = await updatePrefs(patch)
    if (!res.ok) toast(res.error, 'error')
  }

  return (
    <>
      <h1>Настройки</h1>

      <section className="panel stack" aria-labelledby="notif">
        <h2 id="notif" style={{ fontSize: 'var(--fs-lg)' }}>Уведомления</h2>
        <Checkbox
          label="Напоминания о записи"
          hint="За 24 часа и за 2 часа до визита. Только о ваших записях."
          checked={p.reminders}
          onChange={(e) => void save({ reminders: e.target.checked })}
        />
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 'var(--sp-2)' }} disabled={!p.reminders}>
          <legend className="field__label" style={{ marginBottom: 'var(--sp-2)' }}>Канал связи</legend>
          <label className="check">
            <input type="radio" name="channel" checked={p.channel === 'email'} onChange={() => void save({ channel: 'email' })} />
            <span>Email{!user.email && <span className="field__hint" style={{ display: 'block' }}>Email не указан — добавьте его в профиле</span>}</span>
          </label>
          <label className="check">
            <input type="radio" name="channel" checked={p.channel === 'telegram'} onChange={() => void save({ channel: 'telegram' })} />
            <span>Telegram</span>
          </label>
        </fieldset>
        <div className="alert alert--warn">
          Напоминания ставятся в очередь на сервере. Отправка заработает после подключения email-сервиса или Telegram-бота.
        </div>
      </section>

      <section className="panel stack" aria-labelledby="privacy">
        <h2 id="privacy" style={{ fontSize: 'var(--fs-lg)' }}>Приватность</h2>
        <Checkbox
          label="Получать новости и акции"
          hint="Отдельное согласие. Вход через Google его не означает."
          checked={p.marketing}
          onChange={(e) => void save({ marketing: e.target.checked })}
        />
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Имя и телефон видят только сотрудники барбершопа — для связи по вашим записям.
        </p>
      </section>

      {user.role === 'client' && (
        <section className="panel stack" aria-labelledby="first-owner">
          <h2 id="first-owner" style={{ fontSize: 'var(--fs-lg)' }}>Первый запуск</h2>
          <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            Если вы владелец барбершопа и это первый вход после установки — получите права владельца.
            Это сработает только один раз, пока владельца в системе нет.
          </p>
          <div>
            <Button
              loading={claiming}
              onClick={async () => {
                setClaiming(true)
                const res = await claimFirstOwner()
                setClaiming(false)
                if (!res.ok) return toast(res.error, 'error')
                if (!res.value) return toast('Владелец уже назначен. Права выдаёт он', 'error')
                toast('Вы владелец. Панель управления открыта')
                navigate('/dashboard')
              }}
            >
              Стать владельцем
            </Button>
          </div>
        </section>
      )}

      <section className="panel stack" aria-labelledby="danger">
        <h2 id="danger" style={{ fontSize: 'var(--fs-lg)' }}>Удаление аккаунта</h2>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Аккаунт и настройки будут удалены. Прошедшие записи останутся в учёте барбершопа без привязки к аккаунту.
        </p>
        <div>
          <Button variant="danger" loading={deleting} onClick={() => setConfirmDelete(true)}>Удалить аккаунт</Button>
        </div>
      </section>

      {confirmDelete && (
        <ConfirmDialog
          title="Удалить аккаунт?"
          text="Это действие нельзя отменить. Предстоящие записи не отменятся автоматически — отмените их заранее, если не придёте."
          confirmLabel="Удалить аккаунт"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false)
            setDeleting(true)
            const res = await deleteProfile()
            if (!res.ok) {
              setDeleting(false)
              return toast(res.error, 'error')
            }
            try {
              await clerk.user?.delete()
            } catch (e) {
              console.error('[account] профиль удалён, аккаунт Clerk — нет', e)
              toast('Данные удалены, но вход сохранился. Удалите аккаунт в настройках Clerk', 'error')
            }
            await clerk.signOut()
            navigate('/')
          }}
        />
      )}
    </>
  )
}
