import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '@/data/store'
import { usePageMeta } from '@/shared/seo'
import { canReschedule, canTransition, isActive } from '@/domain/statuses'
import { formatDateTime, formatDuration } from '@/domain/format'
import type { Appointment } from '@/domain/types'
import { AppointmentDetails } from '@/features/appointments/AppointmentDetails'
import { AppointmentRow } from '@/features/appointments/AppointmentRow'
import { SlotPicker } from '@/features/booking/SlotPicker'
import { ClientLoginForm } from '@/features/client/ClientLoginForm'
import { Button, Checkbox, ConfirmDialog, EmptyState, Modal, useToast } from '@/shared/ui'
import './my-bookings.css'

export default function MyBookingsPage() {
  usePageMeta('Мои записи', '', { noindex: true })
  const client = useDb((s) => s.client)
  const ready = useDb((s) => s.clientReady)
  const appointments = useDb((s) => s.appointments)
  const clientLogout = useDb((s) => s.clientLogout)
  const [openId, setOpenId] = useState<string | null>(null)

  const [upcoming, past] = useMemo(() => {
    const up = appointments.filter((a) => isActive(a.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    const rest = appointments.filter((a) => !isActive(a.status))
    return [up, rest]
  }, [appointments])
  const opened = appointments.find((a) => a.id === openId)

  if (!ready) return <div className="page-loading" aria-busy="true" />

  if (!client) {
    return (
      <div className="container me">
        <header className="me__head reveal">
          <h1>Мои записи</h1>
          <p className="muted">Введите имя и телефон, которые указывали при записи.</p>
        </header>
        <div className="me__card reveal" style={{ ['--d' as string]: '80ms' }}>
          <ClientLoginForm submitLabel="Показать мои записи" />
        </div>
      </div>
    )
  }

  return (
    <div className="container me">
      <header className="me__head reveal">
        <h1>Привет, {client.name}</h1>
        <p className="muted">
          {client.phone} · <button className="link-btn" onClick={() => void clientLogout()}>это не я</button>
        </p>
      </header>

      <section className="me__section reveal" style={{ ['--d' as string]: '60ms' }} aria-labelledby="up">
        <div className="spread">
          <h2 id="up">Предстоящие</h2>
          {upcoming.length > 0 && <Link to="/book" className="btn btn--book btn--sm">Записаться ещё</Link>}
        </div>
        {upcoming.length ? (
          <div className="me__list">
            {upcoming.map((a) => <AppointmentRow key={a.id} appt={a} onOpen={() => setOpenId(a.id)} />)}
          </div>
        ) : (
          <EmptyState title="Предстоящих записей нет" action={<Link className="btn btn--book" to="/book">Записаться</Link>} />
        )}
      </section>

      <RemindersSection />

      {past.length > 0 && (
        <section className="me__section reveal" style={{ ['--d' as string]: '120ms' }} aria-labelledby="past">
          <h2 id="past">История</h2>
          <div className="me__list">
            {past.map((a) => <AppointmentRow key={a.id} appt={a} onOpen={() => setOpenId(a.id)} />)}
          </div>
        </section>
      )}

      {opened && <BookingModal appt={opened} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function BookingModal({ appt, onClose }: { appt: Appointment; onClose: () => void }) {
  const settings = useDb((s) => s.settings)
  const master = useDb((s) => s.masters.find((m) => m.id === appt.masterId))
  const clientCancel = useDb((s) => s.clientCancel)
  const clientReschedule = useDb((s) => s.clientReschedule)
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [moving, setMoving] = useState(false)
  const [slot, setSlot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cancelCheck = canTransition(appt, 'cancelled', 'client', settings)
  const moveCheck = canReschedule(appt, 'client', settings)
  const reason = !cancelCheck.ok && isActive(appt.status) ? cancelCheck.reason : null

  if (moving && master) {
    return (
      <Modal
        title={`Перенос записи №${appt.number}`}
        onClose={() => setMoving(false)}
        wide
        footer={
          <>
            <Button onClick={() => setMoving(false)}>Назад</Button>
            <Button
              variant="primary"
              disabled={!slot}
              loading={busy}
              onClick={async () => {
                setBusy(true)
                const res = await clientReschedule(appt.id, slot!)
                setBusy(false)
                if (!res.ok) return toast(res.error, 'error')
                toast('Запись перенесена')
                onClose()
              }}
            >
              Перенести
            </Button>
          </>
        }
      >
        <p className="muted" style={{ marginBottom: 'var(--sp-4)' }}>
          Сейчас: {formatDateTime(appt.startsAt)} · {formatDuration(appt.durationMinutes)}
        </p>
        <SlotPicker master={master} durationMinutes={appt.durationMinutes} value={slot} onChange={setSlot} ignoreAppointmentId={appt.id} />
      </Modal>
    )
  }

  return (
    <>
      <Modal title={`Запись №${appt.number}`} onClose={onClose} wide>
        <div className="stack" style={{ gap: 'var(--sp-5)' }}>
          <AppointmentDetails appt={appt} />
          {(cancelCheck.ok || moveCheck.ok) && (
            <div className="row">
              {moveCheck.ok && <Button onClick={() => setMoving(true)}>Перенести</Button>}
              {cancelCheck.ok && <Button variant="danger" onClick={() => setConfirming(true)}>Отменить запись</Button>}
            </div>
          )}
          {reason && <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{reason}</p>}
          {appt.status === 'completed' && !appt.hasReview && (
            <Link to={`/reviews?appointment=${appt.id}`} className="btn btn--sm" style={{ alignSelf: 'flex-start' }}>
              Оставить отзыв
            </Link>
          )}
        </div>
      </Modal>
      {confirming && (
        <ConfirmDialog
          title="Отменить запись?"
          text={`Запись №${appt.number} будет отменена, время освободится.`}
          confirmLabel="Отменить запись"
          danger
          withReason
          onClose={() => setConfirming(false)}
          onConfirm={async (why) => {
            setConfirming(false)
            const res = await clientCancel(appt.id, why || undefined)
            if (!res.ok) return toast(res.error, 'error')
            toast('Запись отменена')
            onClose()
          }}
        />
      )}
    </>
  )
}

function RemindersSection() {
  const client = useDb((s) => s.client)!
  const bot = useDb((s) => s.settings.telegramBotUsername)
  const clientTelegramLink = useDb((s) => s.clientTelegramLink)
  const clientUnlinkTelegram = useDb((s) => s.clientUnlinkTelegram)
  const clientSetReminders = useDb((s) => s.clientSetReminders)
  const clientRestore = useDb((s) => s.clientRestore)
  const toast = useToast()
  const [waiting, setWaiting] = useState(false)
  const [linking, setLinking] = useState(false)

  const connect = async () => {
    setLinking(true)
    // Вкладку открываем сразу по клику, иначе браузер её заблокирует
    const tab = window.open('', '_blank')
    const res = await clientTelegramLink()
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
    <section className="me__section me__reminders reveal" style={{ ['--d' as string]: '90ms' }} aria-labelledby="rem">
      <h2 id="rem">Напоминания</h2>
      <p className="muted">За 24 и за 2 часа до визита — в Telegram.</p>
      {client.telegramLinked ? (
        <div className="row">
          <span className="badge badge--completed">Telegram подключён</span>
          <Checkbox label="Присылать напоминания" checked={client.reminders} onChange={(e) => void clientSetReminders(e.target.checked)} />
          <Button size="sm" variant="ghost" onClick={async () => {
            const res = await clientUnlinkTelegram()
            toast(res.ok ? 'Telegram отключён' : res.error, res.ok ? 'ok' : 'error')
          }}>Отключить</Button>
        </div>
      ) : bot ? (
        <div className="row">
          <Button variant="primary" loading={linking} onClick={() => void connect()}>Подключить Telegram</Button>
          {waiting && (
            <Button onClick={async () => {
              await clientRestore()
              if (useDb.getState().client?.telegramLinked) {
                setWaiting(false)
                toast('Telegram подключён')
              } else toast('Пока не подключено — нажмите «Старт» в боте', 'error')
            }}>Я нажал «Старт»</Button>
          )}
        </div>
      ) : (
        <p className="muted">Напоминания пока не настроены барбершопом.</p>
      )}
    </section>
  )
}
