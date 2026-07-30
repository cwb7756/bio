import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { knowledgeApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import DataTable from '../../components/DataTable'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { Plus, Edit, Trash2, Search } from 'lucide-react'

export default function Flashcards() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const { isEditor } = useAuth()

  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [form, setForm] = useState({ title: '', content: '', chapter: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['flashcards'],
    queryFn: knowledgeApi.flashcardList,
  })

  const saveMutation = useMutation({
    mutationFn: (data) => knowledgeApi.saveFlashcard(data),
    onSuccess: () => {
      success(editingCard ? '闪光卡已更新' : '闪光卡已创建')
      queryClient.invalidateQueries(['flashcards'])
      setDialogOpen(false)
      setEditingCard(null)
    },
    onError: (err) => showError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (cardId) => knowledgeApi.deleteFlashcard(cardId),
    onSuccess: () => {
      success('闪光卡已删除')
      queryClient.invalidateQueries(['flashcards'])
      setDeleteId(null)
    },
    onError: (err) => showError(err.message),
  })

  const handleOpenCreate = () => {
    setEditingCard(null)
    setForm({ title: '', content: '', chapter: '' })
    setDialogOpen(true)
  }

  const handleEdit = (card) => {
    setEditingCard(card)
    setForm({
      title: card.title || '',
      content: card.content || '',
      chapter: card.chapter || '',
    })
    setDialogOpen(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title || !form.content) {
      showError('请输入标题和内容')
      return
    }
    saveMutation.mutate({ ...form, flashcardId: editingCard?._id })
  }

  const filteredData = (data?.list || data || []).filter((item) =>
    !search || item.title?.includes(search) || item.chapter?.includes(search)
  )

  const columns = [
    { key: 'title', header: '标题', render: (v) => <span className="font-medium">{v?.length > 40 ? v.substring(0, 40) + '...' : v}</span> },
    { key: 'content', header: '内容', render: (v) => v?.length > 40 ? v.substring(0, 40) + '...' : (v != null ? v : '-') },
    { key: 'chapter', header: '章节', render: (v) => v != null ? v : '-' },
    { key: 'scope', header: '来源', render: (v) => v === 'user' ? '用户' : '系统' },
    {
      key: 'actions',
      header: '操作',
      width: '120px',
      render: (_, row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleEdit(row)}>
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
        title="闪光卡管理"
        description="管理记忆闪光卡"
        actions={
          isEditor && (
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              新建闪光卡
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索闪光卡"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <DataTable columns={columns} data={filteredData} loading={isLoading} />
        </CardContent>
      </Card>

      {/* 创建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCard ? '编辑闪光卡' : '新建闪光卡'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>标题 *</Label>
              <Textarea
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="卡片标题，如：细胞膜的流动镶嵌模型"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>内容 *</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="卡片内容要点"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>章节</Label>
                <Input
                  value={form.chapter}
                  onChange={(e) => setForm({ ...form, chapter: e.target.value })}
                  placeholder="如：必修一"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="删除闪光卡"
        description="确定要删除该闪光卡吗？"
        confirmText="删除"
        onConfirm={() => deleteMutation.mutate(deleteId)}
      />
    </div>
  )
}
