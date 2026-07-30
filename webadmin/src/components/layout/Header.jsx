import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { LogOut, User } from 'lucide-react'

const roleLabels = {
  superadmin: '超级管理员',
  editor: '编辑',
  viewer: '访客',
}

export default function Header({ title }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{user?.username || '未登录'}</span>
          {user?.role && <Badge variant="secondary">{roleLabels[user.role] || user.role}</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          退出
        </Button>
      </div>
    </header>
  )
}
