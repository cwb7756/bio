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
import { Select } from '../../components/ui/select'
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
  const [form, setForm] = useState({ front: '', back: '', chapter: '', difficulty: 'medium' })

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
    setForm({ front: '', back: '', chapter: '', difficulty: 'medium' })
    setDialogOpen(true)
  }

  const handleEdit = (card) => {
    setEditingCard(card)
    setForm({
      front: card.front || '',
      back: card.back || '',
      chapter: card.chapter || '',
      difficulty: card.difficulty || 'medium',
    })
    setDialogOpen(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.front || !form.back) {
      showError('请输入正面和背面内容')
      return
    }
    saveMutation.mutate({ ...form, cardId: editingCard?._id })
  }

  const filteredData = (data?.list || data || []).filter((item) =>
    !search || item.front?.includes(search) || item.chapter?.includes(search)
  )

  const columns = [
    { key: 'front', header: '正面', render: (v) => <span className="font-medium">{v?.length > 40 ? v.substring(0, 40) + '...' : v}</span> },
    { key: 'back', header: '背面', render: (v) => v?.length > 40 ? v.substring(0, 40) + '...' : v },
    { key: 'chapter', header: '章节', render: (v) => v != null ? v : '-' },
    { key: 'difficulty', header: '难度', render: (v) => {
      const labels = { easy: '简单', medium: '中等', hard: '困难' }
      return labels[v] || (v != null ? v : '-')
    }},
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
              <Label>正面内容 *</Label>
              <Textarea
                value={form.front}
                onChange={(e) => setForm({ ...form, front: e.target.value })}
                placeholder="正面问题或术语"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>背面内容 *</Label>
              <Textarea
                value={form.back}
                onChange={(e) => setForm({ ...form, back: e.target.value })}
                placeholder="背面答案或解释"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>章节</Label>
                <Input
                  value={form.chapter}
                  onChange={(e) => setForm({ ...form, chapter: e.target.value })}
                  placeholder="如：细胞结构"
                />
              </div>
              <div className="space-y-2">
                <Label>难度</Label>
                <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                  <option value="easy">简单</option>
                  <option value="medium">中等</option>
                  <option value="hard">困难</option>
                </Select>
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
