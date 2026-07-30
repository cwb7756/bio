// webadmin/src/pages/models/ModelList.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { modelApi } from '../../lib/api'
import { useModels } from '../../hooks/useApi'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import DataTable from '../../components/DataTable'
import Pagination from '../../components/Pagination'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { Plus, Search, Edit, Trash2, RefreshCw, Download, FileBox } from 'lucide-react'

const fileTypeColors = {
  gltf: 'bg-blue-100 text-blue-800',
  glb: 'bg-purple-100 text-purple-800',
  obj: 'bg-green-100 text-green-800',
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function ModelList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const { isEditor } = useAuth()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [downloading, setDownloading] = useState(null)

  const pageSize = 20

  const { data, isLoading, refetch, error } = useModels({
    skip: (page - 1) * pageSize,
    limit: pageSize,
  })

  const deleteMutation = useMutation({
    mutationFn: (modelId) => modelApi.delete(modelId),
    onSuccess: () => {
      success('模型已删除')
      queryClient.invalidateQueries(['models'])
      setDeleteId(null)
    },
    onError: (err) => {
      showError(err.message || '删除失败')
      setDeleteId(null)
    },
  })

  const handleDownload = async (row) => {
    setDownloading(row._id)
    try {
      const result = await modelApi.download(row._id)
      const link = document.createElement('a')
      link.href = result.url
      link.download = result.fileName || row.fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      success('下载已开始')
    } catch (err) {
      showError(err.message || '获取下载链接失败')
    } finally {
      setDownloading(null)
    }
  }

  // 客户端搜索过滤
  const filteredList = (data?.list || []).filter((m) => {
    if (!search) return true
    const kw = search.toLowerCase()
    return (
      m.name?.toLowerCase().includes(kw) ||
      m.description?.toLowerCase().includes(kw) ||
      m.fileName?.toLowerCase().includes(kw)
    )
  })

  const columns = [
    {
      key: 'thumbnailUrl',
      header: '缩略图',
      width: '90px',
      render: (v, row) => (
        <div className="h-14 w-14 overflow-hidden rounded-md border bg-muted flex items-center justify-center">
          {v ? (
            <img src={v} alt={row.name} className="h-full w-full object-cover" />
          ) : (
            <FileBox className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
      ),
    },
    {
      key: 'name',
      header: '模型名称',
      render: (v, row) => (
        <div className="max-w-xs">
          <div className="font-medium truncate">{v || '-'}</div>
          <div className="text-xs text-muted-foreground truncate">{row.description || ''}</div>
        </div>
      ),
    },
    {
      key: 'fileName',
      header: '文件名',
      render: (v) => <span className="text-sm text-muted-foreground truncate max-w-[180px] inline-block">{v || '-'}</span>,
    },
    {
      key: 'fileType',
      header: '类型',
      width: '90px',
      render: (v) => (
        <Badge className={fileTypeColors[v] || 'bg-gray-100 text-gray-800'}>
          {v ? v.toUpperCase() : '-'}
        </Badge>
      ),
    },
    {
      key: 'fileSize',
      header: '大小',
      width: '100px',
      render: (v) => <span className="text-sm">{formatFileSize(v)}</span>,
    },
    {
      key: 'createdAt',
      header: '创建时间',
      width: '130px',
      render: (v) => (
        <span className="text-sm text-muted-foreground">
          {v ? new Date(v).toLocaleDateString('zh-CN') : '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '150px',
      render: (_, row) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            title="下载模型"
            disabled={downloading === row._id}
            onClick={() => handleDownload(row)}
          >
            <Download className={`h-4 w-4 ${downloading === row._id ? 'animate-bounce' : ''}`} />
          </Button>
          {isEditor && (
            <>
              <Button size="sm" variant="outline" title="编辑" onClick={() => navigate(`/models/${row._id}/edit`)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" title="删除" onClick={() => setDeleteId(row._id)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="3D 模型管理"
        description="管理生物学科 3D 模型资源（上传缩略图与模型文件，小程序端在线查看）"
        actions={
          isEditor && (
            <Button onClick={() => navigate('/models/new')}>
              <Plus className="h-4 w-4 mr-2" />
              上传模型
            </Button>
          )
        }
      />

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
                placeholder="搜索模型名称、描述或文件名"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            {isEditor && (
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>

          <DataTable
            columns={columns}
            data={filteredList}
            loading={isLoading}
            emptyMessage={search ? '没有找到匹配的模型' : '暂无模型，点击右上角上传'}
          />

          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil((data?.total || 0) / pageSize))}
            onPageChange={setPage}
            total={data?.total || 0}
            pageSize={pageSize}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="删除模型"
        description="确定要删除该模型吗？将同时删除云存储中的模型文件与缩略图，此操作不可撤销。"
        confirmText="删除"
        onConfirm={() => deleteMutation.mutate(deleteId)}
      />
    </div>
  )
}
