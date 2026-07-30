import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { feedbackApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Select } from '../../components/ui/select'
import { Badge } from '../../components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import Pagination from '../../components/Pagination'
import { Search, Reply, CheckCircle, MessageSquare } from 'lucide-react'

export default function FeedbackList() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const { isEditor } = useAuth()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [replyDialog, setReplyDialog] = useState(null)
  const [replyContent, setReplyContent] = useState('')

  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['feedback', { page, search, statusFilter }],
    queryFn: () => feedbackApi.list({ page, pageSize, search, status: statusFilter }),
  })

  const replyMutation = useMutation({
    mutationFn: ({ feedbackId, content }) => feedbackApi.reply(feedbackId, content),
    onSuccess: () => {
      success('回复已发送')
      queryClient.invalidateQueries(['feedback'])
      setReplyDialog(null)
      setReplyContent('')
    },
    onError: (err) => showError(err.message),
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ feedbackId, status }) => feedbackApi.updateStatus(feedbackId, status),
    onSuccess: () => {
      success('状态已更新')
      queryClient.invalidateQueries(['feedback'])
    },
    onError: (err) => showError(err.message),
  })

  const handleReply = (e) => {
    e.preventDefault()
    if (!replyContent) { showError('请输入回复内容'); return }
    replyMutation.mutate({ feedbackId: replyDialog._id, content: replyContent })
  }

  return (
    <div>
      <PageHeader title="反馈管理" description="查看和回复用户反馈" />

      <Card>
        <CardContent className="p-4">
          {/* 筛选区 */}
          <div className="mb-4 flex gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索反馈内容"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="w-32"
            >
              <option value="">全部状态</option>
              <option value="pending">待处理</option>
              <option value="replied">已回复</option>
              <option value="resolved">已解决</option>
              <option value="closed">已关闭</option>
            </Select>
          </div>

          {/* 反馈列表 */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>反馈内容</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="w-28">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">加载中...</TableCell></TableRow>
              ) : (data?.list || []).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">暂无反馈</TableCell></TableRow>
              ) : (
                (data?.list || []).map((item) => (
                  <TableRow key={item._id}>
                    <TableCell className="font-medium">{item.userNickName || item.userId?.slice(-8)}</TableCell>
                    <TableCell className="max-w-xs truncate">{item.content}</TableCell>
                    <TableCell><Badge variant="outline">{item.type || '反馈'}</Badge></TableCell>
                    <TableCell><StatusBadge status={item.status || 'pending'} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('zh-CN') : '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setReplyDialog(item)} title="查看/回复">
                          <Reply className="h-4 w-4" />
                        </Button>
                        {isEditor && item.status !== 'resolved' && (
                          <Button size="sm" variant="ghost" onClick={() => updateStatusMutation.mutate({ feedbackId: item._id, status: 'resolved' })} title="标记已解决">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <Pagination
            page={page}
            totalPages={data?.totalPages || 1}
            onPageChange={setPage}
            total={data?.total || 0}
            pageSize={pageSize}
          />
        </CardContent>
      </Card>

      {/* 回复弹窗 */}
      <Dialog open={!!replyDialog} onOpenChange={() => setReplyDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>反馈详情与回复</DialogTitle>
          </DialogHeader>
          {replyDialog && (
            <div className="space-y-4">
              {/* 原始反馈 */}
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{replyDialog.userNickName || '匿名用户'}</span>
                  <StatusBadge status={replyDialog.status || 'pending'} />
                </div>
                <p className="text-sm">{replyDialog.content}</p>
                <p className="text-xs text-muted-foreground">
                  {replyDialog.createdAt ? new Date(replyDialog.createdAt).toLocaleString('zh-CN') : ''}
                </p>
              </div>

              {/* 已有回复 */}
              {replyDialog.replies && replyDialog.replies.length > 0 && (
                <div className="space-y-2">
                  <Label>回复记录</Label>
                  {replyDialog.replies.map((reply, i) => (
                    <div key={i} className="rounded-lg bg-muted/50 p-3">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{reply.adminName || '管理员'}</span>
                        <span className="text-xs text-muted-foreground">
                          {reply.createdAt ? new Date(reply.createdAt).toLocaleString('zh-CN') : ''}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* 回复表单 */}
              {isEditor && (
                <form onSubmit={handleReply} className="space-y-3">
                  <div className="space-y-2">
                    <Label>回复内容</Label>
                    <Textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="请输入回复内容..."
                      rows={3}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => updateStatusMutation.mutate({ feedbackId: replyDialog._id, status: 'closed' })}>
                      关闭反馈
                    </Button>
                    <Button type="submit" disabled={replyMutation.isPending}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      {replyMutation.isPending ? '发送中...' : '发送回复'}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
