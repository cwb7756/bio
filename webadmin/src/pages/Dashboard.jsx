import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../lib/api'
import { queryConfig } from '../hooks/useApi'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import PageHeader from '../components/PageHeader'
import { Users, UserPlus, Activity, FileText, CheckCircle, BookOpen, HelpCircle, TrendingUp, RefreshCw } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Button } from '../components/ui/button'

const statCards = [
  { key: 'totalUsers', label: '总用户数', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'todayNew', label: '今日新增', icon: UserPlus, color: 'text-green-600', bg: 'bg-green-50' },
  { key: 'activeUsers', label: '7 日活跃用户', icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'totalQuizzes', label: '刷题总量', icon: FileText, color: 'text-orange-600', bg: 'bg-orange-50' },
  { key: 'accuracyRate', label: '整体正确率', icon: CheckCircle, color: 'text-teal-600', bg: 'bg-teal-50', isPercent: true },
  { key: 'courseCount', label: '课程总数', icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'quizCount', label: '题目总数', icon: HelpCircle, color: 'text-pink-600', bg: 'bg-pink-50' },
]

export default function Dashboard() {
  const { data: stats, isLoading, refetch, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.getStats,
    staleTime: queryConfig.REALTIME.staleTime, // 30 seconds
    cacheTime: queryConfig.REALTIME.cacheTime, // 5 minutes
    refetchInterval: 30 * 1000, // Auto refresh every 30s
    retry: 2,
    meta: { log: true },
    placeholderData: {
      totalUsers: 0,
      todayNew: 0,
      activeUsers: 0,
      totalQuizzes: 0,
      accuracyRate: 0,
      courseCount: 0,
      quizCount: 0,
      weekActivity: [],
    },
  })

  const handleRefresh = () => {
    refetch()
  }

  return (
    <div>
      <PageHeader 
        title="数据看板" 
        description="系统核心运营数据概览"
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新数据
          </Button>
        }
      />

      {/* Error display */}
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="py-2 text-sm text-red-600">
            数据加载失败，请重试
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          const value = stats?.[card.key]
          return (
            <Card key={card.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <div className={`rounded-lg p-2 ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoading || !stats ? (
                    <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                  ) : value != null ? (
                    card.isPercent ? `${value}%` : value.toLocaleString()
                  ) : (
                    '-'
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 快捷入口 */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">快捷入口</h2>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = '/users'}>
            <CardContent className="flex items-center gap-3 p-4">
              <Users className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium">用户管理</p>
                <p className="text-sm text-muted-foreground">查看与管理用户</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = '/courses'}>
            <CardContent className="flex items-center gap-3 p-4">
              <BookOpen className="h-8 w-8 text-indigo-600" />
              <div>
                <p className="font-medium">课程管理</p>
                <p className="text-sm text-muted-foreground">管理课程与课时</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = '/quiz'}>
            <CardContent className="flex items-center gap-3 p-4">
              <HelpCircle className="h-8 w-8 text-pink-600" />
              <div>
                <p className="font-medium">题库管理</p>
                <p className="text-sm text-muted-foreground">管理题目与批量导入</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = '/feedback'}>
            <CardContent className="flex items-center gap-3 p-4">
              <TrendingUp className="h-8 w-8 text-orange-600" />
              <div>
                <p className="font-medium">反馈管理</p>
                <p className="text-sm text-muted-foreground">查看用户反馈</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {/* 周活跃趋势图 */}
        <Card>
          <CardHeader>
            <CardTitle>近 7 日活跃趋势</CardTitle>
            <CardDescription>每日学习活跃用户数（基于 study_progress 记录）</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || !stats?.weekActivity ? (
              <div className="h-64 flex items-center justify-center rounded bg-muted/20 animate-pulse">加载中...</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={stats.weekActivity}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 刷题正确率分布 */}
        <Card>
          <CardHeader>
            <CardTitle>整体正确率统计</CardTitle>
            <CardDescription>历史答题准确率汇总（基于 quiz 类型进度）</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || stats === null ? (
              <div className="h-64 flex items-center justify-center rounded bg-muted/20 animate-pulse">加载中...</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={[{ name: '正确', value: stats?.accuracyRate ?? 0 }, { name: '错误', value: 100 - (stats?.accuracyRate ?? 0) }]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
