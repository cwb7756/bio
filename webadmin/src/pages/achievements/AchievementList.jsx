import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { achievementApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Select } from '../../components/ui/select'
import { Badge } from '../../components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { Plus, Edit, Trash2, Trophy, Gift, Users } from 'lucide-react'

const achievementTypes = {
  study: '学习类',
  quiz: '刷题类',
  streak: '连胜类',
  social: '社交类',
  special: '特殊类',
}

export default function AchievementList() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const { isEditor } = useAuth()

  const [tab, setTab] = useState('list')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [form, setForm] = useState({
    name: '', description: '', type: 'study', icon: '', condition: '', points: 0,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['achievements'],
    queryFn: achievementApi.list,
  })

  const { data: grantData, isLoading: grantLoading } = useQuery({
    queryKey: ['achievement-grants'],
    queryFn: achievementApi.grantList,
    enabled: tab === 'grants',
  })

  const saveMutation = useMutation({
    mutationFn: (data) => achievementApi.save(data),
    onSuccess: () => {
      success('成就保存成功')
      queryClient.invalidateQueries(['achievements'])
      setDialogOpen(false)
      setEditingItem(null)
    },
    onError: (err) => showError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (achievementId) => achievementApi.delete(achievementId),
    onSuccess: () => {
      success('成就已删除')
      queryClient.invalidateQueries(['achievements'])
      setDeleteId(null)
    },
    onError: (err) => showError(err.message),
  })

  const handleOpenCreate = () => {
    setEditingItem(null)
    setForm({ name: '', description: '', type: 'study', icon: '', condition: '', points: 0 })
    setDialogOpen(true)
  }

  const handleEdit = (item) => {
    setEditingItem(item)
    setForm({
      name: item.name || '',
      description: item.description || '',
      type: item.type || 'study',
      icon: item.icon || '',
      condition: item.condition || '',
      points: item.points || 0,
    })
    setDialogOpen(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name) { showError('请输入成就名称'); return }
    saveMutation.mutate({ ...form, achievementId: editingItem?._id })
  }

  const achievements = data?.list || data || []

  return (
    <div>
      <PageHeader
        title="成就管理"
        description="管理成就与发放记录"
        actions={
          isEditor && (
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              新建成就
            </Button>
          )
        }
      />

      <div className="mb-4 flex gap-2">
        <Button variant={tab === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setTab('list')}>
          <Trophy className="h-4 w-4 mr-2" />
          成就列表 ({achievements.length})
        </Button>
        <Button variant={tab === 'grants' ? 'default' : 'outline'} size="sm" onClick={() => setTab('grants')}>
          <Gift className="h-4 w-4 mr-2" />
          发放记录
        </Button>
      </div>

      {tab === 'list' ? (
        <Card>
          <CardContent className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>成就名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>积分</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">加载中...</TableCell></TableRow>
                ) : achievements.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">暂无成就</TableCell></TableRow>
                ) : (
                  achievements.map((item) => (
                    <TableRow key={item._id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell><Badge variant="secondary">{achievementTypes[item.type] || item.type}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{item.description != null ? item.description : '-'}</TableCell>
                      <TableCell>{item.points || 0}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(item)}><Edit className="h-4 w-4" /></Button>
                          {isEditor && <Button size="sm" variant="ghost" onClick={() => setDeleteId(item._id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              成就发放记录
            </CardTitle>
            <CardDescription>查看成就发放历史</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>成就</TableHead>
                  <TableHead>发放时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grantLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8">加载中...</TableCell></TableRow>
                ) : (grantData?.list || grantData || []).length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">暂无记录</TableCell></TableRow>
                ) : (
                  (grantData?.list || grantData || []).map((grant) => (
                    <TableRow key={grant._id}>
                      <TableCell className="font-medium">{grant.userNickName || grant.userId}</TableCell>
                      <TableCell>{grant.achievementName || grant.achievementId}</TableCell>
                      <TableCell>{grant.createdAt ? new Date(grant.createdAt).toLocaleString('zh-CN') : '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 创建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? '编辑成就' : '新建成就'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>成就名称 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：刷题达人" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>类型</Label>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(achievementTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>积分</Label>
                <Input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="成就描述" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>达成条件</Label>
              <Input value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} placeholder="如：累计刷题100道" />
            </div>
            <div className="space-y-2">
              <Label>图标名称</Label>
              <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="图标标识" />
            </div>
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
        title="删除成就"
        description="确定要删除该成就吗？"
        confirmText="删除"
        onConfirm={() => deleteMutation.mutate(deleteId)}
      />
    </div>
  )
}
