import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useDb } from '@/data/store'
import { supabase } from '@/data/supabase'
import type { Role } from '@/domain/types'
import { Button, useToast } from '@/shared/ui'
import './staff.css'

export type StaffKind = 'owner' | 'master'

export const STAFF_ROLES: Record<StaffKind, Role[]> = {
  owner: ['owner'],
  // Владелец часто сам стрижёт — ему открыт и сайт мастера
  master: ['barber', 'owner'],
}

/**
 * Пускает в панель только нужную роль. Это удобство интерфейса:
 * настоящая проверка прав — в RLS и функциях базы.
 */
export function StaffGate({ kind, children }: { kind: StaffKind; children: ReactNode }) {
  const authReady = useDb((s) => s.authReady)
  const me = useDb((s) => s.me)

  if (!authReady) return <div className="page-loading" aria-busy="true" aria-label="Проверяем вход" />
  if (!me) return <Navigate to="/login" replace />
  if (!STAFF_ROLES[kind].includes(me.role)) return <NoAccess kind={kind} />
  return <>{children}</>
}

function NoAccess({ kind }: { kind: StaffKind }) {
  const me = useDb((s) => s.me)!
  const hasOwner = useDb((s) => s.hasOwner)
  const claimFirstOwner = useDb((s) => s.claimFirstOwner)
  const toast = useToast()
  const navigate = useNavigate()
  const [ownerExists, setOwnerExists] = useState<boolean | null>(null)
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    if (kind !== 'owner') return
    let alive = true
    void hasOwner().then((res) => alive && setOwnerExists(res.ok ? res.value : true))
    return () => {
      alive = false
    }
  }, [hasOwner, kind])

  return (
    <main className="staff-auth">
      <div className="staff-auth__card stack">
        <h1>Доступа пока нет</h1>
        <p className="muted">
          {me.email} вошёл, но у аккаунта нет роли «{kind === 'owner' ? 'Владелец' : 'Мастер'}».
          {kind === 'master' ? ' Попросите владельца выдать роль «Барбер» в разделе «Пользователи».' : ''}
        </p>
        {kind === 'owner' && ownerExists === false && (
          <Button
            variant="primary"
            loading={claiming}
            onClick={async () => {
              setClaiming(true)
              const res = await claimFirstOwner()
              setClaiming(false)
              if (!res.ok) return toast(res.error, 'error')
              if (!res.value) return toast('Владелец уже назначен', 'error')
              toast('Вы владелец')
              navigate('/', { replace: true })
            }}
          >
            Стать владельцем (первый запуск)
          </Button>
        )}
        <Button variant="ghost" onClick={() => void supabase.auth.signOut()}>
          Выйти
        </Button>
      </div>
    </main>
  )
}
