import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import '@google/model-viewer'
import { useModelDetail } from '../../hooks/useApi'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import PageHeader from '../../components/PageHeader'
import { ArrowLeft, Download, FileBox } from 'lucide-react'
import { modelApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'

function formatFileSize(bytes) {
  if (!bytes) return '0 Bytes'
  const units = ['Bytes', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${parseFloat((bytes / 1024 ** index).toFixed(2))} ${units[index]}`
}

export default function ModelViewer() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { success, error: showError } = useToast()
  const { data: model, isLoading, error } = useModelDetail(id, true)

  useEffect(() => {
    document.title = model?.name ? `${model.name} - 模型浏览` : '模型浏览'
    return () => { document.title = '管理后台' }
  }, [model?.name])

  const handleDownload = async () => {
    try {
      const result = await modelApi.download(id)
      const link = document.createElement('a')
      link.href = result.url
      link.download = result.fileName || model.fileName
      link.click()
      success('下载已开始')
    } catch (downloadError) {
      showError(downloadError.message || '获取下载链接失败')
    }
  }

  if (isLoading) return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
  if (error || !model) return <div className="flex flex-col items-center justify-center py-24"><p className="mb-4 text-red-500">加载失败：{error?.message || '模型不存在'}</p><Button variant="outline" onClick={() => navigate('/models')}>返回列表</Button></div>

  const isSupported = ['gltf', 'glb'].includes(model.fileType?.toLowerCase())
  const source = model.url || model.fileUrl || model.modelUrl || model.filePath

  return (
    <div>
      <PageHeader title={model.name || '模型浏览'} description={model.description || '在线查看 3D 模型'} actions={<div className="flex gap-2"><Button variant="outline" onClick={() => navigate('/models')}><ArrowLeft className="mr-2 h-4 w-4" />返回列表</Button><Button variant="outline" onClick={handleDownload}><Download className="mr-2 h-4 w-4" />下载模型</Button></div>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="overflow-hidden"><CardContent className="p-0"><div className="flex min-h-[560px] items-center justify-center bg-slate-950"><div className="text-center text-slate-400"><FileBox className="mx-auto mb-3 h-12 w-12" /><p>暂无可用的模型地址</p></div>{isSupported && source && <model-viewer src={source} alt={model.name || '3D 模型'} camera-controls auto-rotate shadow-intensity="1" style={{ width: '100%', height: '560px' }} />}</div></CardContent></Card>
        <Card><CardContent className="space-y-4 p-5"><h2 className="font-semibold">模型信息</h2><div><p className="text-xs text-muted-foreground">文件名</p><p className="break-all text-sm">{model.fileName || '-'}</p></div><div><p className="text-xs text-muted-foreground">格式</p><p className="text-sm uppercase">{model.fileType || '-'}</p></div><div><p className="text-xs text-muted-foreground">文件大小</p><p className="text-sm">{formatFileSize(model.fileSize)}</p></div>{!isSupported && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">当前格式暂不支持网页预览，请下载后查看。</p>}</CardContent></Card>
      </div>
    </div>
  )
}
