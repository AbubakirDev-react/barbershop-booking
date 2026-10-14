import { usePublicMasters } from '@/data/hooks'
import { usePageMeta } from '@/shared/seo'
import { MasterCard } from '@/features/catalog/MasterCard'
import { EmptyState } from '@/shared/ui'

export default function MastersPage() {
  usePageMeta('Мастера', 'Мастера барбершопа: специализация, график работы и ближайшее свободное время.')
  const masters = usePublicMasters()
  return (
    <div className="container">
      <header className="page-head">
        <h1>Мастера</h1>
        <p>У каждого мастера своё расписание. Ближайшее свободное время рассчитывается по его графику и записям.</p>
      </header>
      {masters.length ? (
        <div className="masters">
          {masters.map((m) => (
            <MasterCard key={m.id} master={m} />
          ))}
        </div>
      ) : (
        <EmptyState title="Мастера ещё не добавлены" text="Список появится, когда владелец заполнит профили мастеров." />
      )}
    </div>
  )
}
