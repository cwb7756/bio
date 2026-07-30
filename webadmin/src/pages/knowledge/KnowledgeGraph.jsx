import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { knowledgeApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select } from '../../components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { Plus, Edit, Trash2, Network, Link2 } from 'lucide-react'

export default function KnowledgeGraph() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const { isEditor } = useAuth()

  const [tab, setTab] = useState('nodes')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [nodeForm, setNodeForm] = useState({ title: '', description: '', difficulty: 1 })
  const [edgeForm, setEdgeForm] = useState({ sourceId: '', targetId: '', type: 'contains' })

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-graph'],
    queryFn: knowledgeApi.listGraph,
  })

  const nodes = data?.nodes || []
  const edges = data?.edges || []

  // 节点 id → 名称映射，用于边列表展示
  const nodeNameMap = nodes.reduce((acc, n) => { acc[n._id] = n.title; return acc }, {})
  const edgeTypeLabels = { contains: '包含', prerequisite: '前置' }

  const saveMutation = useMutation({
    mutationFn: (data) => knowledgeApi.saveGraph({ ...data, type: tab === 'nodes' ? 'node' : 'edge' }),
    onSuccess: () => {
      success('保存成功')
      queryClient.invalidateQueries(['knowledge-graph'])
      setDialogOpen(false)
      setEditingItem(null)
    },
    onError: (err) => showError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => knowledgeApi.deleteGraph(id, tab === 'nodes' ? 'node' : 'edge'),
    onSuccess: () => {
      success('删除成功')
      queryClient.invalidateQueries(['knowledge-graph'])
      setDeleteId(null)
    },
    onError: (err) => showError(err.message),
  })

  const handleOpenCreate = () => {
    setEditingItem(null)
    if (tab === 'nodes') {
      setNodeForm({ title: '', description: '', difficulty: 1 })
    } else {
      setEdgeForm({ sourceId: '', targetId: '', type: 'contains' })
    }
    setDialogOpen(true)
  }

  const handleEdit = (item) => {
    setEditingItem(item)
    if (tab === 'nodes') {
      setNodeForm({ title: item.title || '', description: item.description || '', difficulty: item.difficulty || 1 })
    } else {
      setEdgeForm({ sourceId: item.sourceId || '', targetId: item.targetId || '', type: item.type || 'contains' })
    }
    setDialogOpen(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (tab === 'nodes') {
      if (!nodeForm.title) { showError('请输入节点名称'); return }
      saveMutation.mutate({ ...nodeForm, difficulty: Number(nodeForm.difficulty) || 1, id: editingItem?._id })
    } else {
      if (!edgeForm.sourceId || !edgeForm.targetId) { showError('请选择源节点和目标节点'); return }
      // 边的关系类型用 relation 传递，避免与 node/edge 判别参数 type 冲突（后端会映射回 type 字段）
      saveMutation.mutate({ sourceId: edgeForm.sourceId, targetId: edgeForm.targetId, relation: edgeForm.type, id: editingItem?._id })
    }
  }

  return (
    <div>
      <PageHeader
        title="知识图谱管理"
        description="管理知识图谱的节点与边"
        actions={
          isEditor && (
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {tab === 'nodes' ? '新建节点' : '新建边'}
            </Button>
          )
        }
      />

      {/* Tab 切换 */}
      <div className="mb-4 flex gap-2">
        <Button variant={tab === 'nodes' ? 'default' : 'outline'} size="sm" onClick={() => setTab('nodes')}>
          <Network className="h-4 w-4 mr-2" />
          节点 ({nodes.length})
        </Button>
        <Button variant={tab === 'edges' ? 'default' : 'outline'} size="sm" onClick={() => setTab('edges')}>
          <Link2 className="h-4 w-4 mr-2" />
          边 ({edges.length})
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          {tab === 'nodes' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>节点名称</TableHead>
                  <TableHead>难度</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">加载中...</TableCell></TableRow>
                ) : nodes.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">暂无节点</TableCell></TableRow>
                ) : (
                  nodes.map((node) => (
                    <TableRow key={node._id}>
                      <TableCell className="font-medium">{node.title}</TableCell>
                      <TableCell>{node.difficulty != null ? `★${node.difficulty}` : '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{node.description != null ? node.description : '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(node)}><Edit className="h-4 w-4" /></Button>
                          {isEditor && <Button size="sm" variant="ghost" onClick={() => setDeleteId(node._id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>源节点</TableHead>
                  <TableHead>关系</TableHead>
                  <TableHead>目标节点</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8">加载中...</TableCell></TableRow>
                ) : edges.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">暂无边</TableCell></TableRow>
                ) : (
                  edges.map((edge) => (
                    <TableRow key={edge._id}>
                      <TableCell className="font-medium">{nodeNameMap[edge.sourceId] || edge.sourceId}</TableCell>
                      <TableCell>{edgeTypeLabels[edge.type] || edge.type || '关联'}</TableCell>
                      <TableCell className="font-medium">{nodeNameMap[edge.targetId] || edge.targetId}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(edge)}><Edit className="h-4 w-4" /></Button>
                          {isEditor && <Button size="sm" variant="ghost" onClick={() => setDeleteId(edge._id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 创建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? '编辑' : '新建'}{tab === 'nodes' ? '节点' : '边'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'nodes' ? (
              <>
                <div className="space-y-2">
                  <Label>节点名称 *</Label>
                  <Input value={nodeForm.title} onChange={(e) => setNodeForm({ ...nodeForm, title: e.target.value })} placeholder="如：细胞膜" />
                </div>
                <div className="space-y-2">
                  <Label>难度（1-5）</Label>
                  <Select value={nodeForm.difficulty} onChange={(e) => setNodeForm({ ...nodeForm, difficulty: e.target.value })}>
                    {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>★{d}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>描述</Label>
                  <Input value={nodeForm.description} onChange={(e) => setNodeForm({ ...nodeForm, description: e.target.value })} />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>源节点 *</Label>
                  <Select value={edgeForm.sourceId} onChange={(e) => setEdgeForm({ ...edgeForm, sourceId: e.target.value })}>
                    <option value="">请选择</option>
                    {nodes.map((n) => <option key={n._id} value={n._id}>{n.title}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>关系类型</Label>
                  <Select value={edgeForm.type} onChange={(e) => setEdgeForm({ ...edgeForm, type: e.target.value })}>
                    <option value="contains">包含</option>
                    <option value="prerequisite">前置</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>目标节点 *</Label>
                  <Select value={edgeForm.targetId} onChange={(e) => setEdgeForm({ ...edgeForm, targetId: e.target.value })}>
                    <option value="">请选择</option>
                    {nodes.map((n) => <option key={n._id} value={n._id}>{n.title}</option>)}
                  </Select>
                </div>
              </>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? '保存中...' : '保存'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="删除"
        description={`确定要删除该${tab === 'nodes' ? '节点' : '边'}吗？`}
        confirmText="删除"
        onConfirm={() => deleteMutation.mutate(deleteId)}
      />
    </div>
  )
}
