import { useMemo, useState } from 'react'
import { useDb } from '@/data/store'
import { useCurrentUser, useOwnMaster } from '@/data/hooks'
import type { Appointment } from '@/domain/types'
import { AppointmentActions, AppointmentDetails } from '@/features/appointments/AppointmentDetails'
import { Modal } from '@/shared/ui'

/**
 * Записи, доступные текущему сотруднику: владелец видит всё, барбер,
 * привязанный к мастеру, — только записи этого мастера.
 * (В Supabase то же самое обеспечит RLS-политика.)
 */
export function useStaffAppointments(): Appointment[] {
  const user = useCurrentUser()
  const own = useOwnMaster()
  const all = useDb((s) => s.appointments)
  return useMemo(() => {
    if (user?.role === 'barber' && own) return all.filter((a) => a.masterId === own.id)
    return all
  }, [all, user?.role, own])
}

/** Мастера, которых сотрудник может выбрать в фильтрах и при ручной записи */
export function useStaffMasters() {
  const user = useCurrentUser()
  const own = useOwnMaster()
  const masters = useDb((s) => s.masters)
  return useMemo(() => {
    if (user?.role === 'barber' && own) return [own]
    return masters.filter((m) => m.active)
  }, [masters, user?.role, own])
}

export function useAppointmentModal() {
  const [openId, setOpenId] = useState<string | null>(null)
  const appt = useDb((s) => s.appointments.find((a) => a.id === openId))
  const modal = appt ? (
    <Modal title={`Запись №${appt.number}`} onClose={() => setOpenId(null)} wide>
      <div className="stack" style={{ gap: 'var(--sp-5)' }}>
        <AppointmentDetails appt={appt} showClient />
        <AppointmentActions appt={appt} />
      </div>
    </Modal>
  ) : null
  return { open: setOpenId, modal }
}
