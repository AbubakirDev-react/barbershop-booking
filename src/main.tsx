import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/unbounded/cyrillic-500.css'
import '@fontsource/unbounded/cyrillic-600.css'
import '@fontsource/unbounded/latin-600.css'
import '@fontsource/golos-text/cyrillic-400.css'
import '@fontsource/golos-text/cyrillic-500.css'
import '@fontsource/golos-text/cyrillic-600.css'
import '@fontsource/golos-text/latin-400.css'
import '@fontsource/golos-text/latin-600.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import { APP, BASE } from './app/appKind'
import { ToastProvider } from './shared/ui'
import { useDb } from './data/store'

/**
 * GitHub Pages не знает про маршруты SPA: на прямой ссылке /book он отдаёт
 * 404.html, а тот переадресует сюда с ?p=/book. Восстанавливаем адрес.
 */
const restored = new URLSearchParams(window.location.search).get('p')
if (restored && restored.startsWith('/')) {
  window.history.replaceState(null, '', BASE.replace(/\/$/, '') + restored)
}

// В сборке остаётся только одно приложение: значение APP подставляется при сборке
const App =
  APP === 'owner'
    ? lazy(() => import('./apps/staff/StaffApp').then((m) => ({ default: () => <m.StaffApp kind="owner" /> })))
    : APP === 'master'
      ? lazy(() => import('./apps/staff/StaffApp').then((m) => ({ default: () => <m.StaffApp kind="master" /> })))
      : lazy(() => import('./apps/client/ClientApp'))

document.documentElement.dataset.app = APP
void useDb.getState().loadPublic()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </ToastProvider>
  </StrictMode>,
)
