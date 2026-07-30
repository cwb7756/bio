import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mistakeApi, userApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { Search, Download, Trash2 } from 'lucide-react'

const statusVariants = {
  pending: 'secondary',
  reviewed: 'default',
  resolved: 'outline',
}

export default function MistakeList() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()

  const [searchTerm, setSearchTerm] = useState('')
  const [userIdFilter, setUserIdFilter] = useState('')
  const [selectedMistakes, setSelectedMistakes] = useState([])
  const [deleteIds, setDeleteIds] = useState(null)

  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => userApi.list({ page: 1, pageSize: 1000 }),
  })

  const { data: mistakesData, isLoading } = useQuery({
    queryKey: ['mistakes', searchTerm, userIdFilter],
    queryFn: () => mistakeApi.list({ page: 1, pageSize: 50, chapter: searchTerm || '', userId: userIdFilter || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: (mistakeIds) => mistakeApi.bulkDelete(mistakeIds),
    onSuccess: () => {
      success('已删除错题')
      queryClient.invalidateQueries(['mistakes'])
      setSelectedMistakes([])
      setDeleteIds(null)
    },
    onError: (err) => showError(err.message),
  })

  const exportMutation = useMutation({
    mutationFn: (userId) => mistakeApi.export(userId),
    onSuccess: (data) => {
      // 下载 JSON 文件
      const blob = new Blob([JSON.stringify(data.content, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.filename
      a.click()
      URL.revokeObjectURL(url)
      success('错题已导出')
    },
    onError: (err) => showError(err.message),
  })

  const handleUserSelect = (e) => {
    setUserIdFilter(e.target.value || undefined)
  }

  const toggleSelectAll = () => {
    if (selectedMistakes.length === mistakes?.list?.length) {
      setSelectedMistakes([])
    } else {
      setSelectedMistakes(mistakes?.list?.map(m => m._id) || [])
    }
  }

  const toggleSelectOne = (id) => {
    if (selectedMistakes.includes(id)) {
      setSelectedMistakes(selectedMistakes.filter(sid => sid !== id))
    } else {
      setSelectedMistakes([...selectedMistakes, id])
    }
  }

  const handleDelete = () => {
    deleteMutation.mutate(deleteIds)
  }

  const handleExportUser = (userId, username) => {
    exportMutation.mutate(userId)
  }

  const mistakes = mistakesData?.list || []
  const usersList = users?.data?.list || users?.list || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="错题本管理"
        description="查看和管理学生学习错题"
        actions={
          selectedMistakes.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteIds(selectedMistakes)}>
              <Trash2 className="h-4 w-4 mr-2" />
              批量删除 ({selectedMistakes.length})
            </Button>
          )
        }
      />

      {/* 筛选器 */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>章节/关键词搜索</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="章节名或题干关键词"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Button size="icon" onClick={() => setSearchTerm(searchTerm)} disabled={isLoading}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>按学生筛选</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={userIdFilter || ''}
                onChange={(e) => setUserIdFilter(e.target.value || undefined)}
              >
                <option value="">全部学生</option>
                {usersList.map((u) => (
                  <option key={u._id} value={u._id}>{u.nickName}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              共 {mistakesData?.total || 0} 条错题
            </div>
            <Button 
              variant="outline" 
              onClick={() => exportMutation.mutate(userIdFilter || usersList[0]?._id)}
              disabled={exportMutation.isPending || !userIdFilter && usersList.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              {exportMutation.isPending ? '导出中...' : '导出错题本'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 错题列表 */}
      <Card>
        <CardHeader>
          <CardTitle>错题列表</CardTitle>
          <CardDescription>共 {mistakesData?.total || 0} 条错题</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={selectedMistakes.length === mistakes.length && mistakes.length > 0}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>题目 ID</TableHead>
                <TableHead>所属章节</TableHead>
                <TableHead>题干</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>错误时间</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">加载中...</TableCell></TableRow>
              ) : mistakes.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">暂无错题</TableCell></TableRow>
              ) : (
                mistakes.map((m) => (
                  <TableRow key={m._id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedMistakes.includes(m._id)}
                        onChange={() => toggleSelectOne(m._id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.questionId || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{m.chapter || '未分类'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{m.stem}</TableCell>
                    <TableCell>{m.nickname || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.createdAt ? new Date(m.createdAt).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => window.location.href = '/quiz/new'}
                      >
                        查看
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteIds}
        onOpenChange={() => setDeleteIds(null)}
        title="批量删除错题"
        description={`确定要删除这 ${deleteIds?.length} 条错题吗？此操作不可恢复。`}
        confirmText="删除"
        onConfirm={handleDelete}
      />
    </div>
  )
}
