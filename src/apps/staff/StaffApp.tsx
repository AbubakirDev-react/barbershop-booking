import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { BASE } from '@/app/appKind'
import DashboardLayout from '@/app/layouts/DashboardLayout'
import { supabase } from '@/data/supabase'
import { useDb } from '@/data/store'
import { StaffGate, type StaffKind } from './StaffGate'
import StaffLoginPage from './StaffLoginPage'

const DashboardHome = lazy(() => import('@/pages/dashboard/DashboardHome'))
const CalendarPage = lazy(() => import('@/pages/dashboard/CalendarPage'))
const AppointmentsPage = lazy(() => import('@/pages/dashboard/AppointmentsPage'))
const ClientsPage = lazy(() => import('@/pages/dashboard/ClientsPage'))
const NotificationsPage = lazy(() => import('@/pages/dashboard/NotificationsPage'))
const ServicesAdminPage = lazy(() => import('@/pages/dashboard/ServicesAdminPage'))
const CategoriesPage = lazy(() => import('@/pages/dashboard/CategoriesPage'))
const MastersAdminPage = lazy(() => import('@/pages/dashboard/MastersAdminPage'))
const AnalyticsPage = lazy(() => import('@/pages/dashboard/AnalyticsPage'))
const ReviewsAdminPage = lazy(() => import('@/pages/dashboard/ReviewsAdminPage'))
const SettingsPage = lazy(() => import('@/pages/dashboard/SettingsPage'))
const UsersPage = lazy(() => import('@/pages/dashboard/UsersPage'))

const page = (node: ReactNode) => <Suspense fallback={<div className="page-loading" aria-busy="true" />}>{node}</Suspense>

/** Разделы, общие для мастера и владельца */
const common = [
  { index: true, element: page(<DashboardHome />) },
  { path: 'calendar', element: page(<CalendarPage />) },
  { path: 'appointments', element: page(<AppointmentsPage />) },
  { path: 'clients', element: page(<ClientsPage />) },
  { path: 'notifications', element: page(<NotificationsPage />) },
]
const ownerOnly = [
  { path: 'services', element: page(<ServicesAdminPage />) },
  { path: 'categories', element: page(<CategoriesPage />) },
  { path: 'masters', element: page(<MastersAdminPage />) },
  { path: 'reviews', element: page(<ReviewsAdminPage />) },
  { path: 'analytics', element: page(<AnalyticsPage />) },
  { path: 'users', element: page(<UsersPage />) },
  { path: 'settings', element: page(<SettingsPage />) },
]

function makeRouter(kind: StaffKind) {
  return createBrowserRouter(
    [
      { path: '/login', element: <StaffLoginPage kind={kind} /> },
      {
        path: '/',
        element: (
          <StaffGate kind={kind}>
            <DashboardLayout kind={kind} />
          </StaffGate>
        ),
        children: [...common, ...(kind === 'owner' ? ownerOnly : []), { path: '*', element: <Navigate to="/" replace /> }],
      },
    ],
    { basename: BASE.replace(/\/$/, '') || '/' },
  )
}

const routers: Partial<Record<StaffKind, ReturnType<typeof makeRouter>>> = {}

/**
 * Сайт сотрудника. Вход — Supabase Auth (email + пароль); роль и доступ
 * определяет база (profiles.role), а не этот код.
 */
export function StaffApp({ kind }: { kind: StaffKind }) {
  const setIdentity = useDb((s) => s.setIdentity)

  useEffect(() => {
    const sync = (user: { user_metadata?: Record<string, unknown>; email?: string } | null) => {
      const meta = user?.user_metadata ?? {}
      void setIdentity(
        user ? { name: String(meta.name ?? ''), surname: String(meta.surname ?? ''), email: user.email ?? '' } : null,
      )
    }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Обновление токена не меняет пользователя — профиль не перечитываем
      if (event === 'TOKEN_REFRESHED') return
      sync(session?.user ?? null)
    })
    return () => data.subscription.unsubscribe()
  }, [setIdentity])

  routers[kind] ??= makeRouter(kind)
  return <RouterProvider router={routers[kind]!} />
}
