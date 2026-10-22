import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { BASE } from '@/app/appKind'
import { PublicLayout } from '@/app/layouts/PublicLayout'
import { useDb } from '@/data/store'
import HomePage from '@/pages/public/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'

const AboutPage = lazy(() => import('@/pages/public/AboutPage'))
const ServicesPage = lazy(() => import('@/pages/public/ServicesPage'))
const MastersPage = lazy(() => import('@/pages/public/MastersPage'))
const ReviewsPage = lazy(() => import('@/pages/public/ReviewsPage'))
const BookPage = lazy(() => import('@/pages/booking/BookPage'))
const MyBookingsPage = lazy(() => import('@/pages/client/MyBookingsPage'))

const page = (node: ReactNode) => <Suspense fallback={<div className="page-loading" aria-busy="true" />}>{node}</Suspense>

const router = createBrowserRouter(
  [
    {
      element: <PublicLayout />,
      children: [
        { path: '/', element: <HomePage /> },
        { path: '/services', element: page(<ServicesPage />) },
        { path: '/masters', element: page(<MastersPage />) },
        { path: '/reviews', element: page(<ReviewsPage />) },
        { path: '/about', element: page(<AboutPage />) },
        { path: '/book', element: page(<BookPage />) },
        { path: '/me', element: page(<MyBookingsPage />) },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: BASE.replace(/\/$/, '') || '/' },
)

export default function ClientApp() {
  const clientRestore = useDb((s) => s.clientRestore)
  // Клиент, который уже записывался с этого устройства, «входит» автоматически
  useEffect(() => {
    void clientRestore()
  }, [clientRestore])
  return <RouterProvider router={router} />
}
