import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { ruRU } from '@clerk/localizations'
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
import { router } from './app/router'
import { AuthSync } from './app/AuthSync'
import { ToastProvider } from './shared/ui'
import { applyStoredTheme } from './shared/theme'
import { useDb } from './data/store'

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
if (!clerkKey) throw new Error('Не задан VITE_CLERK_PUBLISHABLE_KEY в .env')

applyStoredTheme()
void useDb.getState().loadPublic()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={clerkKey}
      localization={ruRU}
      signInUrl="/login"
      signUpUrl="/register"
      afterSignOutUrl="/"
      appearance={{
        variables: {
          colorPrimary: '#3f6c9a',
          fontFamily: "'Golos Text', system-ui, sans-serif",
          borderRadius: '6px',
        },
      }}
    >
      <AuthSync />
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </ClerkProvider>
  </StrictMode>,
)
