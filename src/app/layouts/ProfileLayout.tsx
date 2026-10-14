import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useClerk } from '@clerk/clerk-react'
import { useCurrentUser, isStaffRole } from '@/data/hooks'
import { Avatar, Button, Icon } from '@/shared/ui'
import './profile-layout.css'

export default function ProfileLayout() {
  const user = useCurrentUser()!
  const { signOut } = useClerk()
  const navigate = useNavigate()
  const fullName = [user.name, user.surname].filter(Boolean).join(' ')

  return (
    <div className="container profile">
      <aside className="profile__side">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <Avatar name={fullName} photo={null} size={52} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 600 }}>{fullName}</p>
            <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{user.phone || user.email || 'Контакты не указаны'}</p>
          </div>
        </div>
        <nav className="profile__nav" aria-label="Разделы профиля">
          <NavLink to="/profile" end>Профиль</NavLink>
          <NavLink to="/profile/appointments">Мои записи</NavLink>
          <NavLink to="/profile/settings">Настройки</NavLink>
          {isStaffRole(user.role) && <NavLink to="/dashboard">Панель управления</NavLink>}
        </nav>
        <Button
          variant="ghost"
          onClick={() => void signOut(() => navigate('/'))}
        >
          <Icon name="logout" /> Выйти
        </Button>
      </aside>
      <div className="profile__main">
        <Outlet />
      </div>
    </div>
  )
}
