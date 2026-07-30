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

export default function KnowledgePoints() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const { isEditor } = useAuth()

  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPoint, setEditingPoint] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [form, setForm] = useState({ title: '', chapter: '', desc: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-points'],
    queryFn: knowledgeApi.listPoints,
  })

  const saveMutation = useMutation({
    mutationFn: (data) => knowledgeApi.savePoint(data),
    onSuccess: () => {
      success(editingPoint ? '知识点已更新' : '知识点已创建')
      queryClient.invalidateQueries(['knowledge-points'])
      setDialogOpen(false)
      setEditingPoint(null)
    },
    onError: (err) => showError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (pointId) => knowledgeApi.deletePoint(pointId),
    onSuccess: () => {
      success('知识点已删除')
      queryClient.invalidateQueries(['knowledge-points'])
      setDeleteId(null)
    },
    onError: (err) => showError(err.message),
  })

  const handleOpenCreate = () => {
    setEditingPoint(null)
    setForm({ title: '', chapter: '', desc: '' })
    setDialogOpen(true)
  }

  const handleEdit = (point) => {
    setEditingPoint(point)
    setForm({
      title: point.title || '',
      chapter: point.chapter || '',
      desc: point.desc || '',
    })
    setDialogOpen(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title) {
      showError('请输入知识点名称')
      return
    }
    saveMutation.mutate({ ...form, pointId: editingPoint?._id })
  }

  const filteredData = (data?.list || data || []).filter((item) =>
    !search || item.title?.includes(search) || item.chapter?.includes(search)
  )

  const columns = [
    { key: 'title', header: '知识点名称', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'chapter', header: '章节', render: (v) => v != null ? v : '-' },
    { key: 'desc', header: '描述', render: (v) => v?.length > 50 ? v.substring(0, 50) + '...' : (v != null ? v : '-') },
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
        title="知识点管理"
        description="管理生物知识点体系"
        actions={
          isEditor && (
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              新建知识点
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索知识点"
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
            <DialogTitle>{editingPoint ? '编辑知识点' : '新建知识点'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>知识点名称 *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="如：细胞膜的结构"
              />
            </div>
            <div className="space-y-2">
              <Label>所属章节</Label>
              <Input
                value={form.chapter}
                onChange={(e) => setForm({ ...form, chapter: e.target.value })}
                placeholder="如：必修一"
              />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea
                value={form.desc}
                onChange={(e) => setForm({ ...form, desc: e.target.value })}
                placeholder="知识点描述"
                rows={3}
              />
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
        title="删除知识点"
        description="确定要删除该知识点吗？"
        confirmText="删除"
        onConfirm={() => deleteMutation.mutate(deleteId)}
      />
    </div>
  )
}
