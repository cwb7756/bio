import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { quizApi } from '../../lib/api'
import { useQuizzes, cancelAndSetQueryData, rollbackPreviousData } from '../../hooks/useApi'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { Badge } from '../../components/ui/badge'
import DataTable from '../../components/DataTable'
import Pagination from '../../components/Pagination'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { Plus, Search, Edit, Trash2, RefreshCw, CheckSquare, Square, X, Upload, Sparkles, CheckCircle2, XCircle } from 'lucide-react'

const questionTypes = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  fill: '填空题',
}

const questionStatus = {
  pending: { label: '待审核', variant: 'warning' },
  approved: { label: '已上线', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'destructive' },
}

export default function QuizList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const { isEditor } = useAuth()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [chapterFilter, setChapterFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [currentPageSelected, setCurrentPageSelected] = useState([])

  const pageSize = 20

  // Optimized query with semistatic data cache strategy
  const { data, isLoading, refetch, error } = useQuizzes(
    { page, search, type: typeFilter, chapter: chapterFilter, status: statusFilter },
    {}
  )

  // Single delete mutation
  const deleteMutation = useMutation({
    mutationFn: (quizId) => quizApi.delete(quizId),
    onMutate: async (quizId) => {
      await cancelAndSetQueryData(queryClient, ['quiz', { page, search, typeFilter, chapterFilter }])
      
      const previousQuizzes = queryClient.getQueryData(['quiz', { page, search, typeFilter, chapterFilter }])
      
      // Remove the quiz optimistically
      queryClient.setQueryData(['quiz', { page, search, typeFilter, chapterFilter }], old => {
        if (!old || !old.list) return old
        return {
          ...old,
          list: old.list.filter(q => q._id !== quizId),
          total: Math.max(0, (old.total || 0) - 1)
        }
      })
      
      return { previousQuizzes }
    },
    onError: (err, quizId, context) => {
      rollbackPreviousData(
        queryClient, 
        ['quiz', { page, search, typeFilter, chapterFilter }], 
        context?.previousQuizzes
      )
      showError(err.message || '删除失败')
      setDeleteId(null)
    },
    onSuccess: () => {
      success('题目已删除')
      queryClient.invalidateQueries(['quiz'])
      setDeleteId(null)
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (quizIds) => quizApi.batchDelete(quizIds),
    onSuccess: () => {
      success('已批量删除题目')
      queryClient.invalidateQueries(['quiz'])
      setCurrentPageSelected([])
    },
    onError: (err) => showError(err.message || '批量删除失败'),
  })

  // Bulk review mutation (approve 上线 / reject 拒绝)
  const bulkReviewMutation = useMutation({
    mutationFn: ({ ids, action }) => quizApi.batchReview(ids, action),
    onSuccess: (res) => {
      success(res?.updated ? `已处理 ${res.updated} 条题目` : '处理完成')
      queryClient.invalidateQueries(['quiz'])
      setCurrentPageSelected([])
    },
    onError: (err) => showError(err.message || '批量审核失败'),
  })

  const handleBulkReview = (action) => {
    bulkReviewMutation.mutate({ ids: currentPageSelected, action })
  }

  const handleRefresh = () => {
    refetch();
  }

  const columns = [
    {
      key: 'stem',
      header: '题干',
      render: (v) => <span className="truncate max-w-md inline-block">{v != null ? (v.length > 50 ? v.substring(0, 50) + '...' : v) : '-'}</span>,
    },
    {
      key: 'type',
      header: '类型',
      width: '100px',
      render: (v) => <span className="text-sm">{v != null ? (questionTypes[v] || v) : '-'}</span>,
    },
    { key: 'chapter', header: '章节', width: '120px', render: (v) => v != null ? v : '-' },
    { key: 'difficulty', header: '难度', width: '80px', render: (v) => {
      const colors = { easy: 'text-green-600', medium: 'text-yellow-600', hard: 'text-red-600' }
      const labels = { easy: '简单', medium: '中等', hard: '困难' }
      return <span className={colors[v]}>{v != null ? (labels[v] || v) : '-'}</span>
    }},
    { key: 'status', header: '状态', width: '90px', render: (v) => {
      const cfg = questionStatus[v]
      if (cfg) return <Badge variant={cfg.variant}>{cfg.label}</Badge>
      // 存量旧题无 status 字段，视为已上线
      return <Badge variant="success">已上线</Badge>
    }},
    {
      key: 'actions',
      header: '操作',
      width: '120px',
      render: (_, row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate(`/quiz/${row._id}/edit`)}>
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

  return (
    <div>
      <PageHeader 
        title="题库管理" 
        description="管理题目与批量导入" 
        actions={
          isEditor && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/quiz/ai')}>
                <Sparkles className="h-4 w-4 mr-2" />
                AI 出题
              </Button>
              <Button variant="outline" onClick={() => navigate('/quiz/import')}>
                <Upload className="h-4 w-4 mr-2" />
                批量导入
              </Button>
              <Button onClick={() => navigate('/quiz/new')}>
                <Plus className="h-4 w-4 mr-2" />
                新建题目
              </Button>
            </div>
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
          <div className="mb-4 flex gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索题目关键词"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-10"
              />
            </div>
            <Select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
              className="w-32"
            >
              <option value="">全部类型</option>
              {Object.entries(questionTypes).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
            <Input
              placeholder="按章节筛选"
              value={chapterFilter}
              onChange={(e) => { setChapterFilter(e.target.value); setPage(1) }}
              className="w-32"
            />
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="w-32"
            >
              <option value="">全部状态</option>
              <option value="pending">待审核</option>
              <option value="approved">已上线</option>
              <option value="rejected">已拒绝</option>
            </Select>
            {isEditor && (
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>

          {isEditor && currentPageSelected.length > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-primary/10 p-3">
              <div className="flex items-center gap-2 text-primary">
                <CheckSquare className="h-5 w-5" />
                <span>已选择 {currentPageSelected.length} 道题目</span>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={() => handleBulkReview('approve')}
                  disabled={bulkReviewMutation.isLoading}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  通过上线
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleBulkReview('reject')}
                  disabled={bulkReviewMutation.isLoading}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  拒绝
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => bulkDeleteMutation.mutate(currentPageSelected)}
                  disabled={bulkDeleteMutation.isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  批量删除
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCurrentPageSelected([])}>
                  <X className="h-4 w-4" />
                  取消
                </Button>
              </div>
            </div>
          )}

          <DataTable 
            columns={columns} 
            data={data?.list} 
            loading={isLoading}
            selectable={isEditor}
            selectedRows={currentPageSelected}
            onSelectionChange={setCurrentPageSelected}
          />

          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil((data?.total || 0) / pageSize))}
            onPageChange={(newPage) => {
              setPage(newPage)
              setCurrentPageSelected([])
            }}
            total={data?.total || 0}
            pageSize={pageSize}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="删除题目"
        description="确定要删除该题目吗？"
        confirmText="删除"
        onConfirm={() => deleteMutation.mutate(deleteId)}
      />
    </div>
  )
}
