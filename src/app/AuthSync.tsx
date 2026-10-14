import { useEffect } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useDb } from '@/data/store'

/**
 * Связывает сессию Clerk с данными: при входе создаёт/читает профиль в
 * Supabase (роль определяется там, а не в браузере), при выходе очищает
 * приватный кэш, чтобы данные одного пользователя не увидел следующий.
 */
export function AuthSync() {
  const { isLoaded, isSignedIn, user } = useUser()
  const setIdentity = useDb((s) => s.setIdentity)
  const refreshPrivate = useDb((s) => s.refreshPrivate)
  const userId = user?.id
  const name = user?.firstName ?? ''
  const surname = user?.lastName ?? ''
  const email = user?.primaryEmailAddress?.emailAddress ?? ''

  useEffect(() => {
    if (!isLoaded) return
    void setIdentity(isSignedIn ? { name, surname, email } : null)
    // Профиль синхронизируем при смене пользователя, а не при каждом изменении имени
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, userId, setIdentity])

  // Обновляем записи при возвращении на вкладку: их могли изменить другие
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') void refreshPrivate()
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [refreshPrivate])

  return null
}
