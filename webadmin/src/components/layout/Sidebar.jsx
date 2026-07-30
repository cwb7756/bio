import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  HelpCircle,
  Network,
  Trophy,
  MessageSquare,
  Settings,
  GraduationCap,
  Box,
  TrendingUp,
} from 'lucide-react'

const navItems = [
  { path: '/', label: '数据看板', icon: LayoutDashboard, roles: ['superadmin', 'editor', 'viewer'] },
  { path: '/users', label: '用户管理', icon: Users, roles: ['superadmin', 'editor', 'viewer'] },
  { path: '/courses', label: '课程管理', icon: BookOpen, roles: ['superadmin', 'editor', 'viewer'] },
  { path: '/quiz', label: '题库管理', icon: HelpCircle, roles: ['superadmin', 'editor', 'viewer'] },
  { path: '/mistakes', label: '错题管理', icon: TrendingUp, roles: ['superadmin', 'editor', 'viewer'] },
  { path: '/knowledge', label: '知识体系', icon: Network, roles: ['superadmin', 'editor', 'viewer'], hasChildren: true },
  { path: '/models', label: '3D 模型', icon: Box, roles: ['superadmin', 'editor'] },
  { path: '/achievements', label: '成就管理', icon: Trophy, roles: ['superadmin', 'editor', 'viewer'] },
  { path: '/feedback', label: '反馈管理', icon: MessageSquare, roles: ['superadmin', 'editor', 'viewer'] },
  { path: '/settings/admins', label: '系统设置', icon: Settings, roles: ['superadmin'] },
]

const knowledgeSubItems = [
  { path: '/knowledge/points', label: '知识点' },
  { path: '/knowledge/graph', label: '知识图谱' },
  { path: '/knowledge/flashcards', label: '闪光卡' },
]

export default function Sidebar({ collapsed, onToggle }) {
  const { user, isAuthenticated, hasRole } = useAuth()
  const location = useLocation()

  // 已登录但 role 校验失败时（如旧数据），回退显示全部导航项
  const filteredItems = isAuthenticated
    ? navItems.filter((item) => hasRole(item.roles) || hasRole(['superadmin', 'editor', 'viewer']) === false)
    : []

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-muted/40 transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b px-4">
        <GraduationCap className="h-8 w-8 text-primary flex-shrink-0" />
        {!collapsed && (
          <span className="ml-2 text-lg font-bold">管理后台</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {filteredItems.map((item) => {
          const Icon = item.icon

          return (
            <div key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>

              {/* 知识体系子菜单：紧跟父项下方展开 */}
              {item.hasChildren && !collapsed && location.pathname.startsWith(item.path) && (
                <div className="my-1 ml-8 space-y-1 border-l pl-4">
                  {knowledgeSubItems.map((sub) => (
                    <NavLink
                      key={sub.path}
                      to={sub.path}
                      className={({ isActive }) =>
                        cn(
                          'block px-3 py-2 text-sm transition-colors rounded-md',
                          isActive
                            ? 'text-primary font-medium bg-accent'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                        )
                      }
                    >
                      {sub.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Toggle button */}
      <div className="border-t p-4">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-md py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          {collapsed ? '→' : '← 折叠'}
        </button>
      </div>
    </aside>
  )
}
