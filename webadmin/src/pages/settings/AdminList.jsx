import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import { Select } from '../../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { Plus, Trash2, KeyRound, Shield } from 'lucide-react'

const roleLabels = {
  superadmin: '超级管理员',
  editor: '编辑',
  viewer: '访客',
}

const roleVariants = {
  superadmin: 'destructive',
  editor: 'default',
  viewer: 'secondary',
}

export default function AdminList() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()

  const [createDialog, setCreateDialog] = useState(false)
  const [pwdDialog, setPwdDialog] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'editor' })
  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['admins'],
    queryFn: authApi.listAdmins,
  })

  const createMutation = useMutation({
    mutationFn: (data) => authApi.createAdmin(data),
    onSuccess: () => {
      success('管理员创建成功')
      queryClient.invalidateQueries(['admins'])
      setCreateDialog(false)
      setCreateForm({ username: '', password: '', role: 'editor' })
    },
    onError: (err) => showError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (adminId) => authApi.deleteAdmin(adminId),
    onSuccess: () => {
      success('管理员已删除')
      queryClient.invalidateQueries(['admins'])
      setDeleteId(null)
    },
    onError: (err) => showError(err.message),
  })

  const changePwdMutation = useMutation({
    mutationFn: (data) => authApi.changePassword(data),
    onSuccess: () => {
      success('密码修改成功')
      setPwdDialog(false)
      setPwdForm({ oldPassword: '', newPassword: '' })
    },
    onError: (err) => showError(err.message),
  })

  const handleCreate = (e) => {
    e.preventDefault()
    if (!createForm.username || !createForm.password) {
      showError('请输入用户名和密码')
      return
    }
    createMutation.mutate(createForm)
  }

  const handleChangePwd = (e) => {
    e.preventDefault()
    if (!pwdForm.oldPassword || !pwdForm.newPassword) {
      showError('请输入旧密码和新密码')
      return
    }
    changePwdMutation.mutate(pwdForm)
  }

  const admins = data?.list || data || []

  return (
    <div>
      <PageHeader
        title="管理员管理"
        description="管理系统管理员账号"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPwdDialog(true)}>
              <KeyRound className="h-4 w-4 mr-2" />
              修改密码
            </Button>
            <Button onClick={() => setCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              新建管理员
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            管理员列表
          </CardTitle>
          <CardDescription>共 {admins.length} 位管理员</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">加载中...</TableCell></TableRow>
              ) : admins.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">暂无管理员</TableCell></TableRow>
              ) : (
                admins.map((admin) => (
                  <TableRow key={admin._id}>
                    <TableCell className="font-medium">{admin.username}</TableCell>
                    <TableCell>
                      <Badge variant={roleVariants[admin.role] || 'secondary'}>
                        {roleLabels[admin.role] || admin.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString('zh-CN') : '-'}
                    </TableCell>
                    <TableCell>
                      {admin.role !== 'superadmin' && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteId(admin._id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 创建管理员弹窗 */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建管理员</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>用户名 *</Label>
              <Input
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                placeholder="请输入用户名"
              />
            </div>
            <div className="space-y-2">
              <Label>密码 *</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="请输入密码"
              />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                <option value="editor">编辑（可管理数据）</option>
                <option value="viewer">访客（只读）</option>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialog(false)}>取消</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 修改密码弹窗 */}
      <Dialog open={pwdDialog} onOpenChange={setPwdDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePwd} className="space-y-4">
            <div className="space-y-2">
              <Label>旧密码 *</Label>
              <Input
                type="password"
                value={pwdForm.oldPassword}
                onChange={(e) => setPwdForm({ ...pwdForm, oldPassword: e.target.value })}
                placeholder="请输入旧密码"
              />
            </div>
            <div className="space-y-2">
              <Label>新密码 *</Label>
              <Input
                type="password"
                value={pwdForm.newPassword}
                onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                placeholder="请输入新密码"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwdDialog(false)}>取消</Button>
              <Button type="submit" disabled={changePwdMutation.isPending}>
                {changePwdMutation.isPending ? '修改中...' : '确认修改'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="删除管理员"
        description="确定要删除该管理员吗？删除后不可恢复。"
        confirmText="删除"
        onConfirm={() => deleteMutation.mutate(deleteId)}
      />
    </div>
  )
}
