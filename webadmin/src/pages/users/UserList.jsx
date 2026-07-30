import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { userApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { useUsers, cancelAndSetQueryData, rollbackPreviousData } from '../../hooks/useApi'
import { Card, CardContent } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { Select } from '../../components/ui/select'
import DataTable from '../../components/DataTable'
import Pagination from '../../components/Pagination'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import { Search, Eye, Ban, RotateCcw, RefreshCw } from 'lucide-react'

export default function UserList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const { isEditor } = useAuth()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)

  const pageSize = 20

  // Optimized query with cache configuration
  const { data, isLoading, refetch, error } = useUsers({ page, search, status: statusFilter }, {})

  // Optimistic update for user status change (ban/unban)
  const updateStatusMutation = useMutation({
    mutationFn: ({ userId, status }) => userApi.updateStatus(userId, status),
    onMutate: async ({ userId, status }) => {
      // Cancel outgoing refetch
      await cancelAndSetQueryData(queryClient, ['users', { page, search, statusFilter }])
      
      // Snapshot the previous value
      const previousUsers = queryClient.getQueryData(['users'])
      
      // Optimistically update UI
      queryClient.setQueryData(['users'], old => {
        if (!old || !old.list) return old
        return {
          ...old,
          list: old.list.map(u => 
            u._id === userId ? { ...u, status } : u
          )
        }
      })
      
      return { previousUsers }
    },
    onError: (err, variables, context) => {
      // Rollback on error
      rollbackPreviousData(queryClient, ['users', { page, search, statusFilter }], context?.previousUsers)
      showError(err.message || '操作失败')
    },
    onSuccess: () => {
      success('操作成功')
      queryClient.invalidateQueries(['users'])
      setConfirmAction(null)
    },
  })

  // Optimistic update for progress reset
  const resetProgressMutation = useMutation({
    mutationFn: (userId) => userApi.resetProgress(userId),
    onMutate: async (userId) => {
      await cancelAndSetQueryData(queryClient, ['users', { page, search, statusFilter }])
      const previousUsers = queryClient.getQueryData(['users'])
      
      // Show loading indicator in UI (optional visual feedback)
      queryClient.setQueryData(['users'], old => {
        if (!old || !old.list) return old
        return {
          ...old,
          list: old.list.map(u => 
            u._id === userId ? { ...u, _showLoading: true } : { ...u, _showLoading: false }
          )
        }
      })
      
      return { previousUsers }
    },
    onError: (err, userId, context) => {
      rollbackPreviousData(queryClient, ['users', { page, search, statusFilter }], context?.previousUsers)
      showError(err.message || '重置失败')
    },
    onSuccess: () => {
      success('学习进度已重置')
      queryClient.invalidateQueries(['users'])
      setConfirmAction(null)
    },
  })

  const handleRefresh = () => {
    refetch();
  }

  const columns = [
    { key: '_id', header: 'ID', width: '120px', render: (v) => <span className="text-xs font-mono text-muted-foreground">{v?.slice(-8)}</span> },
    { key: 'nickname', header: '昵称', render: (v) => v != null ? v : '-' },
    { key: 'grade', header: '年级', render: (v) => v != null ? v : '-' },
    { key: 'createdAt', header: '注册时间', render: (v) => v ? new Date(v).toLocaleDateString('zh-CN') : '-' },
    {
      key: 'status',
      header: '状态',
      render: (v) => <StatusBadge status={v || 'active'} />,
    },
    {
      key: 'actions',
      header: '操作',
      width: '200px',
      render: (_, row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate(`/users/${row._id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
          {isEditor && (
            <>
              {row.status === 'banned' ? (
                <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: 'unban', userId: row._id })}>
                  解封
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: 'ban', userId: row._id })}>
                  <Ban className="h-4 w-4" />
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setConfirmAction({ type: 'reset', userId: row._id })}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  const handleSearch = (e) => {
    setSearch(e.target.value)
    setPage(1)
  }

  const handleConfirm = () => {
    if (!confirmAction) return
    if (confirmAction.type === 'ban') {
      updateStatusMutation.mutate({ userId: confirmAction.userId, status: 'banned' })
    } else if (confirmAction.type === 'unban') {
      updateStatusMutation.mutate({ userId: confirmAction.userId, status: 'active' })
    } else if (confirmAction.type === 'reset') {
      resetProgressMutation.mutate(confirmAction.userId)
    }
  }

  const confirmConfig = {
    ban: { title: '封禁用户', description: '确定要封禁该用户吗？封禁后该用户将无法使用小程序。', confirmText: '封禁' },
    unban: { title: '解封用户', description: '确定要解封该用户吗？', confirmText: '解封' },
    reset: { title: '重置学习进度', description: '确定要重置该用户的学习进度吗？此操作不可撤销。', confirmText: '重置' },
  }

  return (
    <div>
      <PageHeader 
        title="用户管理" 
        description="查看和管理小程序用户"
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
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

      <Card>
        <CardContent className="p-4">
          {/* 筛选区 */}
          <div className="mb-4 flex gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索昵称或 ID"
                value={search}
                onChange={handleSearch}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="w-32"
            >
              <option value="">全部状态</option>
              <option value="active">正常</option>
              <option value="banned">已封禁</option>
            </Select>
          </div>

          {/* 表格 */}
          <DataTable columns={columns} data={data?.list} loading={isLoading} />

          {/* 分页 */}
          <Pagination
            page={page}
            totalPages={data?.totalPages || 1}
            onPageChange={setPage}
            total={data?.total || 0}
            pageSize={pageSize}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={() => setConfirmAction(null)}
        {...(confirmAction ? confirmConfig[confirmAction.type] : {})}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
