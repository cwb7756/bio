import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const titleMap = {
  '/': '数据看板',
  '/users': '用户管理',
  '/courses': '课程管理',
  '/quiz': '题库管理',
  '/quiz/import': '批量导入题目',
  '/knowledge/points': '知识点管理',
  '/knowledge/graph': '知识图谱管理',
  '/knowledge/flashcards': '闪光卡管理',
  '/achievements': '成就管理',
  '/feedback': '反馈管理',
  '/settings/admins': '管理员管理',
  '/settings/config': '系统配置',
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  // 根据当前路径确定页面标题
  const getTitle = () => {
    const path = location.pathname
    if (path.startsWith('/users/') && path !== '/users') return '用户详情'
    if (path.startsWith('/courses/new')) return '新建课程'
    if (path.startsWith('/courses/') && path.includes('/edit')) return '编辑课程'
    if (path.startsWith('/quiz/new')) return '新建题目'
    if (path.startsWith('/quiz/') && path.includes('/edit')) return '编辑题目'
    return titleMap[path] || '管理后台'
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={getTitle()} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
