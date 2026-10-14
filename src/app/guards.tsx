import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useDb } from '@/data/store'
import type { Role } from '@/domain/types'
import { EmptyState } from '@/shared/ui'

/**
 * Клиентская защита маршрутов — только для удобства интерфейса.
 * Настоящая проверка прав — в Supabase (RLS + RPC): скрытая страница
 * не означает закрытые данные.
 */
function AuthPending() {
  return (
    <div className="container" style={{ padding: '48px 16px' }} aria-busy="true" aria-label="Проверяем вход">
      <div className="skeleton" style={{ height: 32, width: 240, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 16, width: '60%' }} />
    </div>
  )
}

function useAuthState() {
  const authReady = useDb((s) => s.authReady)
  const me = useDb((s) => s.me)
  const loadError = useDb((s) => s.loadError)
  return { authReady, me, loadError }
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { authReady, me } = useAuthState()
  const location = useLocation()
  if (!authReady) return <AuthPending />
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children}</>
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { authReady, me } = useAuthState()
  const location = useLocation()
  if (!authReady) return <AuthPending />
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (!roles.includes(me.role)) {
    return (
      <div className="container" style={{ padding: '64px 16px' }}>
        <EmptyState
          title="Нет доступа к этому разделу"
          text="Раздел доступен другой роли. Если доступ нужен, обратитесь к владельцу барбершопа."
          action={<Link className="btn" to={me.role === 'client' ? '/profile' : '/dashboard'}>Вернуться</Link>}
        />
      </div>
    )
  }
  return <>{children}</>
}
