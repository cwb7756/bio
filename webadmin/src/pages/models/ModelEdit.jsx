// webadmin/src/pages/models/ModelEdit.jsx
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { modelApi } from '../../lib/api'
import { useModelDetail } from '../../hooks/useApi'
import { useToast } from '../../hooks/useToast'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Label } from '../../components/ui/label'
import PageHeader from '../../components/PageHeader'
import { Save, ArrowLeft, FileBox } from 'lucide-react'

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function ModelEdit() {
  const navigate = useNavigate()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const { data: model, isLoading, error } = useModelDetail(id, true)

  useEffect(() => {
    if (model) {
      setName(model.name || '')
      setDescription(model.description || '')
    }
  }, [model])

  const updateMutation = useMutation({
    mutationFn: () => modelApi.update(id, { name: name.trim(), description: description.trim() }),
    onSuccess: () => {
      success('模型已更新')
      queryClient.invalidateQueries(['models'])
      queryClient.invalidateQueries(['model-detail', id])
      navigate('/models')
    },
    onError: (err) => showError(err.message || '更新失败'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) {
      showError('请输入模型名称')
      return
    }
    updateMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !model) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="mb-4 text-red-500">加载失败：{error?.message || '模型不存在'}</p>
        <Button variant="outline" onClick={() => navigate('/models')}>返回列表</Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="编辑模型"
        description="修改模型的名称与描述信息"
        actions={
          <Button variant="outline" onClick={() => navigate('/models')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回列表
          </Button>
        }
      />

      <Card>
        <CardContent className="p-6">
          {/* 模型文件信息 */}
          <div className="mb-6 rounded-lg bg-muted/50 p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-background">
                {model.thumbnailUrl ? (
                  <img src={model.thumbnailUrl} alt={model.name} className="h-full w-full object-cover" />
                ) : (
                  <FileBox className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{model.fileName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  类型：{model.fileType?.toUpperCase()} · 大小：{formatFileSize(model.fileSize)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  上传时间：{model.createdAt ? new Date(model.createdAt).toLocaleString('zh-CN') : '-'}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="name">模型名称 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入模型名称"
                maxLength={100}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">描述信息</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请输入模型的描述信息..."
                rows={4}
                maxLength={500}
              />
            </div>

            <div className="flex justify-end gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => navigate('/models')}>
                取消
              </Button>
              <Button type="submit" disabled={updateMutation.isPending || updateMutation.isLoading}>
                {updateMutation.isPending || updateMutation.isLoading ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    保存修改
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
