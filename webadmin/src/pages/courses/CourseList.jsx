import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { courseApi } from '../../lib/api'
import { useCourses, cancelAndSetQueryData, rollbackPreviousData } from '../../hooks/useApi'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import DataTable from '../../components/DataTable'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { Plus, Search, Edit, Trash2, RefreshCw } from 'lucide-react'

export default function CourseList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const { isEditor } = useAuth()

  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState(null)

  // Optimized query with static data cache strategy
  const { data, isLoading, refetch, error } = useCourses({ search }, {})

  // Optimistic update for delete operation
  const deleteMutation = useMutation({
    mutationFn: (courseId) => courseApi.delete(courseId),
    onMutate: async (courseId) => {
      await cancelAndSetQueryData(queryClient, ['courses', { search }])
      
      const previousCourses = queryClient.getQueryData(['courses'])
      
      // Remove the course from the list optimistically
      queryClient.setQueryData(['courses'], old => {
        if (!old || !old.list) return old
        return {
          ...old,
          list: old.list.filter(c => c._id !== courseId),
          total: Math.max(0, (old.total || 0) - 1)
        }
      })
      
      return { previousCourses }
    },
    onError: (err, courseId, context) => {
      rollbackPreviousData(queryClient, ['courses', { search }], context?.previousCourses)
      showError(err.message || '删除失败')
      setDeleteId(null)
    },
    onSuccess: () => {
      success('课程已删除')
      queryClient.invalidateQueries(['courses'])
      setDeleteId(null)
    },
  })

  const handleRefresh = () => {
    refetch();
  }

  const columns = [
    { key: 'title', header: '课程名称', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'grade', header: '年级', render: (v) => v != null ? v : '-' },
    { key: 'textbook', header: '教材分册', render: (v) => v != null ? v : '-' },
    { key: 'lessonCount', header: '课时数', render: (v) => v || 0 },
    { key: 'createdAt', header: '创建时间', render: (v) => v ? new Date(v).toLocaleDateString('zh-CN') : '-' },
    {
      key: 'actions',
      header: '操作',
      width: '150px',
      render: (_, row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate(`/courses/${row._id}/edit`)}>
            <Edit className="h-4 w-4" />
          </Button>
          {isEditor && (
            <Button size="sm" variant="outline" onClick={() => setDeleteId(row._id)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  const handleSearch = (e) => {
    setSearch(e.target.value)
    setPage(1)
  }

  // Need to define page state for pagination if needed
  const [page, setPage] = useState(1)

  return (
    <div>
      <PageHeader 
        title="课程管理"
        description="管理课程与课时内容"
        actions={
          isEditor && (
            <Button onClick={() => navigate('/courses/new')}>
              <Plus className="h-4 w-4 mr-2" />
              新建课程
            </Button>
          )
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

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索课程名称"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-10"
            />
          </div>

          <DataTable columns={columns} data={data?.list || data} loading={isLoading} />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="删除课程"
        description="确定要删除该课程吗？删除后不可恢复，关联课时也将被删除。"
        confirmText="删除"
        onConfirm={() => deleteMutation.mutate(deleteId)}
      />
    </div>
  )
}
