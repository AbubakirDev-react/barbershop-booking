import { SignIn } from '@clerk/clerk-react'
import { useSearchParams } from 'react-router-dom'
import { usePageMeta } from '@/shared/seo'
import './auth.css'

/** Разрешаем возврат только на внутренние страницы — защита от open redirect */
export function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback
}

export default function LoginPage() {
  usePageMeta('Вход', '', { noindex: true })
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'), '/profile')
  return (
    <div className="container auth">
      <SignIn routing="path" path="/login" signUpUrl={`/register?next=${encodeURIComponent(next)}`} forceRedirectUrl={next} />
    </div>
  )
}
