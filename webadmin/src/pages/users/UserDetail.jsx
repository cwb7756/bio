import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { userApi } from '../../lib/api'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import StatusBadge from '../../components/StatusBadge'
import PageHeader from '../../components/PageHeader'
import { ArrowLeft, User, BookOpen, CheckCircle, XCircle, Clock } from 'lucide-react'

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: () => userApi.detail(id),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <div className="py-12 text-center text-muted-foreground">用户不存在</div>
  }

  return (
    <div>
      <PageHeader
        title="用户详情"
        actions={
          <Button variant="outline" onClick={() => navigate('/users')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回列表
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        {/* 基本信息 */}
        <Card 
          className="md:col-span-1 h-fit" 
          style={{
            backgroundImage: user.avatar ? `url(${user.avatar})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <User className="h-5 w-5" />
                基本信息
              </span>
              <StatusBadge status={user.banned ? 'banned' : 'active'} />
            </CardTitle>
            <CardDescription>用户概览</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">昵称</span>
              <span className="font-medium">{user.nickname != null ? user.nickname : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">年级</span>
              <span className="font-medium">{user.grade || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">连续打卡</span>
              <span className="font-medium">{user.streakDays} 天</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">学习时长</span>
              <span className="font-medium">{Math.floor(user.totalStudyMinutes / 60)} 小时 {user.totalStudyMinutes % 60} 分钟</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">注册时间</span>
              <span className="font-medium">{user.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">最后登录</span>
              <span className="font-medium">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-muted-foreground">用户 ID</span>
              <span className="font-mono text-xs break-all">{user._id}</span>
            </div>
          </CardContent>
        </Card>

        {/* 学习进度 */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              学习进度
            </CardTitle>
            <CardDescription>用户课程学习与刷题数据</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">刷题次数</p>
                <p className="text-2xl font-bold">{user.stats?.quizCount || 0}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">课程学习</p>
                <p className="text-2xl font-bold">{user.stats?.lessonCount || 0}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">错题本</p>
                <p className="text-2xl font-bold text-red-600 flex items-center gap-1">
                  <XCircle className="h-5 w-5" />
                  {user.stats?.mistakeCount || 0}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">学习天数</p>
                <p className="text-2xl font-bold text-blue-600 flex items-center gap-1">
                  <Clock className="h-5 w-5" />
                  {user.streakDays}
                </p>
              </div>
            </div>

            {/* 学习记录 */}
            <div className="mt-6">
              <h4 className="mb-3 text-sm font-medium">最近学习记录</h4>
              <div className="space-y-2">
                {user.records && user.records.length > 0 ? (
                  user.records.slice(0, 5).map((record, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <span className="text-muted-foreground">
                        {record.courseName || record.chapter != null ? record.chapter : '-'}
                      </span>
                      <span>{record.progress || 0}%</span>
                      <span className="text-muted-foreground">
                        {record.lastStudyTime ? new Date(record.lastStudyTime).toLocaleDateString('zh-CN') : '-'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无学习记录
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
