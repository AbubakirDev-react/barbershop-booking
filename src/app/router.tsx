import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { PublicLayout } from './layouts/PublicLayout'
import { RequireAuth, RequireRole } from './guards'
import HomePage from '@/pages/public/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'

// Публичная главная грузится сразу, остальное — по требованию
const AboutPage = lazy(() => import('@/pages/public/AboutPage'))
const ServicesPage = lazy(() => import('@/pages/public/ServicesPage'))
const MastersPage = lazy(() => import('@/pages/public/MastersPage'))
const ReviewsPage = lazy(() => import('@/pages/public/ReviewsPage'))
const BookPage = lazy(() => import('@/pages/booking/BookPage'))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))

const ProfileLayout = lazy(() => import('./layouts/ProfileLayout'))
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'))
const MyAppointmentsPage = lazy(() => import('@/pages/profile/MyAppointmentsPage'))
const MyAppointmentPage = lazy(() => import('@/pages/profile/MyAppointmentPage'))
const ProfileSettingsPage = lazy(() => import('@/pages/profile/ProfileSettingsPage'))

const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'))
const DashboardHome = lazy(() => import('@/pages/dashboard/DashboardHome'))
const CalendarPage = lazy(() => import('@/pages/dashboard/CalendarPage'))
const AppointmentsPage = lazy(() => import('@/pages/dashboard/AppointmentsPage'))
const ClientsPage = lazy(() => import('@/pages/dashboard/ClientsPage'))
const ServicesAdminPage = lazy(() => import('@/pages/dashboard/ServicesAdminPage'))
const CategoriesPage = lazy(() => import('@/pages/dashboard/CategoriesPage'))
const MastersAdminPage = lazy(() => import('@/pages/dashboard/MastersAdminPage'))
const AnalyticsPage = lazy(() => import('@/pages/dashboard/AnalyticsPage'))
const NotificationsPage = lazy(() => import('@/pages/dashboard/NotificationsPage'))
const ReviewsAdminPage = lazy(() => import('@/pages/dashboard/ReviewsAdminPage'))
const SettingsPage = lazy(() => import('@/pages/dashboard/SettingsPage'))
const UsersPage = lazy(() => import('@/pages/dashboard/UsersPage'))

const page = (node: ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>

function PageFallback() {
  return (
    <div className="container" style={{ padding: '48px 16px' }} aria-busy="true" aria-label="Загрузка">
      <div className="skeleton" style={{ height: 32, width: 240, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 16, width: '60%' }} />
    </div>
  )
}

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/about', element: page(<AboutPage />) },
      { path: '/services', element: page(<ServicesPage />) },
      { path: '/masters', element: page(<MastersPage />) },
      { path: '/reviews', element: page(<ReviewsPage />) },
      { path: '/book', element: page(<BookPage />) },
      { path: '/login/*', element: page(<LoginPage />) },
      { path: '/register/*', element: page(<RegisterPage />) },
      {
        path: '/profile',
        element: <RequireAuth>{page(<ProfileLayout />)}</RequireAuth>,
        children: [
          { index: true, element: page(<ProfilePage />) },
          { path: 'appointments', element: page(<MyAppointmentsPage />) },
          { path: 'appointments/:id', element: page(<MyAppointmentPage />) },
          { path: 'settings', element: page(<ProfileSettingsPage />) },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/dashboard',
    element: (
      <RequireRole roles={['barber', 'owner']}>
        {page(<DashboardLayout />)}
      </RequireRole>
    ),
    children: [
      { index: true, element: page(<DashboardHome />) },
      { path: 'calendar', element: page(<CalendarPage />) },
      { path: 'appointments', element: page(<AppointmentsPage />) },
      { path: 'clients', element: page(<ClientsPage />) },
      { path: 'notifications', element: page(<NotificationsPage />) },
      { path: 'settings', element: page(<SettingsPage />) },
      { path: 'services', element: <RequireRole roles={['owner']}>{page(<ServicesAdminPage />)}</RequireRole> },
      { path: 'categories', element: <RequireRole roles={['owner']}>{page(<CategoriesPage />)}</RequireRole> },
      { path: 'masters', element: <RequireRole roles={['owner']}>{page(<MastersAdminPage />)}</RequireRole> },
      { path: 'analytics', element: <RequireRole roles={['owner']}>{page(<AnalyticsPage />)}</RequireRole> },
      { path: 'reviews', element: <RequireRole roles={['owner']}>{page(<ReviewsAdminPage />)}</RequireRole> },
      { path: 'users', element: <RequireRole roles={['owner']}>{page(<UsersPage />)}</RequireRole> },
    ],
  },
])
