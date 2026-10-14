import { SignUp } from '@clerk/clerk-react'
import { useSearchParams } from 'react-router-dom'
import { usePageMeta } from '@/shared/seo'
import { safeNext } from './LoginPage'
import './auth.css'

export default function RegisterPage() {
  usePageMeta('Регистрация', '', { noindex: true })
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'), '/profile')
  return (
    <div className="container auth">
      <SignUp routing="path" path="/register" signInUrl={`/login?next=${encodeURIComponent(next)}`} forceRedirectUrl={next} />
    </div>
  )
}
