import { useEffect, useState } from 'react'
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
  // Кнопка «Стать владельцем» нужна только при первом запуске, пока владельца нет
  const hasOwner = useDb((s) => s.hasOwner)
  const [ownerExists, setOwnerExists] = useState<boolean | null>(null)
  useEffect(() => {
    if (user.role !== 'client') return
    let alive = true
    void hasOwner().then((res) => {
      if (alive) setOwnerExists(res.ok ? res.value : true)
    })
    return () => {
      alive = false
    }
  }, [hasOwner, user.role])
  const p = user.prefs

  const save = async (patch: Partial<UserPrefs>) => {
    const res = await updatePrefs(patch)
    if (!res.ok) toast(res.error, 'error')
  }

  return (
    <>
      <h1>Настройки</h1>

      <NotificationsSection />

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

      {user.role === 'client' && ownerExists === false && (
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

function NotificationsSection() {
  const user = useCurrentUser()!
  const settings = useDb((s) => s.settings)
  const updatePrefs = useDb((s) => s.updatePrefs)
  const createTelegramLink = useDb((s) => s.createTelegramLink)
  const unlinkTelegram = useDb((s) => s.unlinkTelegram)
  const reloadMe = useDb((s) => s.reloadMe)
  const toast = useToast()
  const [linking, setLinking] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const p = user.prefs
  const emailOn = settings.emailRemindersEnabled

  const save = async (patch: Partial<UserPrefs>) => {
    const res = await updatePrefs(patch)
    if (!res.ok) toast(res.error, 'error')
  }

  const connect = async () => {
    setLinking(true)
    // Окно открываем сразу по клику, иначе браузер заблокирует его как всплывающее
    const tab = window.open('', '_blank')
    const res = await createTelegramLink()
    setLinking(false)
    if (!res.ok) {
      tab?.close()
      return toast(res.error, 'error')
    }
    if (tab) tab.location.href = res.value
    else window.location.href = res.value
    setWaiting(true)
  }

  return (
    <section className="panel stack" aria-labelledby="notif">
      <h2 id="notif" style={{ fontSize: 'var(--fs-lg)' }}>Напоминания о записи</h2>
      <Checkbox
        label="Напоминать о записи"
        hint="За 24 часа и за 2 часа до визита. Только о ваших записях."
        checked={p.reminders}
        onChange={(e) => void save({ reminders: e.target.checked })}
      />

      <div className="stack" style={{ gap: 'var(--sp-2)' }}>
        <p className="field__label">Telegram</p>
        {user.telegramLinked ? (
          <div className="row">
            <span className="badge badge--completed">Подключён</span>
            <Button size="sm" variant="ghost" onClick={async () => {
              const res = await unlinkTelegram()
              toast(res.ok ? 'Telegram отключён' : res.error, res.ok ? 'ok' : 'error')
            }}>Отключить</Button>
          </div>
        ) : settings.telegramBotUsername ? (
          <div className="stack" style={{ gap: 'var(--sp-2)' }}>
            <div className="row">
              <Button variant="primary" loading={linking} onClick={() => void connect()}>Подключить Telegram</Button>
              {waiting && (
                <Button onClick={async () => {
                  await reloadMe()
                  if (!useDb.getState().me?.telegramLinked) toast('Пока не подключено. В Telegram нажмите «Старт» у бота', 'error')
                  else { setWaiting(false); toast('Telegram подключён') }
                }}>Я нажал «Старт» — проверить</Button>
              )}
            </div>
            <p className="field__hint">Откроется бот @{settings.telegramBotUsername}. Нажмите в нём «Старт» — и напоминания будут приходить туда.</p>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Барбершоп ещё не подключил Telegram-бота.</p>
        )}
      </div>

      {emailOn && (
        <label className="check">
          <input
            type="checkbox"
            checked={p.channel === 'email' && !user.telegramLinked}
            disabled={user.telegramLinked || !user.email}
            onChange={(e) => void save({ channel: e.target.checked ? 'email' : 'telegram' })}
          />
          <span>
            Email{user.email ? ` (${user.email})` : ''}
            <span className="field__hint" style={{ display: 'block' }}>
              {user.telegramLinked ? 'Сейчас напоминания приходят в Telegram' : user.email ? 'Если Telegram не подключён' : 'Email не указан — добавьте его в профиле'}
            </span>
          </span>
        </label>
      )}
    </section>
  )
}
