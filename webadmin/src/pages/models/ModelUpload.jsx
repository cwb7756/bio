// webadmin/src/pages/models/ModelUpload.jsx
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { modelApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { Card, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Label } from '../../components/ui/label'
import PageHeader from '../../components/PageHeader'
import { Upload, FileBox, FileImage, X, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'

const ALLOWED_MODEL_TYPES = ['gltf', 'glb', 'obj']
const ALLOWED_IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'webp']
const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB（base64 上传限制）

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function readFileAsBase64(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // 去掉 data:xxx;base64, 前缀
      const base64 = String(reader.result).split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 50)) // 读取占前 50%
      }
    }
    reader.readAsDataURL(file)
  })
}

export default function ModelUpload() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [modelFile, setModelFile] = useState(null)
  const [thumbnailFile, setThumbnailFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('') // 当前上传阶段提示

  const modelInputRef = useRef(null)
  const thumbnailInputRef = useRef(null)

  const uploadMutation = useMutation({
    mutationFn: async () => {
      // 1. 上传缩略图（可选）
      let thumbnailFileID = ''
      if (thumbnailFile) {
        setStage('正在上传缩略图...')
        setProgress(10)
        const thumbBase64 = await readFileAsBase64(thumbnailFile)
        const thumbRes = await modelApi.uploadFile({
          kind: 'thumbnail',
          fileName: thumbnailFile.name,
          fileBase64: thumbBase64,
        })
        thumbnailFileID = thumbRes.fileID
        setProgress(30)
      }

      // 2. 上传模型文件
      setStage('正在上传模型文件...')
      setProgress(thumbnailFile ? 40 : 15)
      const modelBase64 = await readFileAsBase64(modelFile, (p) => {
        setProgress((thumbnailFile ? 40 : 15) + Math.round(p / 2))
      })
      const modelRes = await modelApi.uploadFile({
        kind: 'model',
        fileName: modelFile.name,
        fileBase64: modelBase64,
      })
      setProgress(85)

      // 3. 创建模型记录
      setStage('正在保存模型信息...')
      const createRes = await modelApi.create({
        name: name.trim(),
        description: description.trim(),
        modelFileID: modelRes.fileID,
        thumbnailFileID,
        fileSize: modelRes.fileSize,
        fileName: modelFile.name,
      })
      setProgress(100)
      return createRes
    },
    onSuccess: () => {
      success('模型上传成功')
      queryClient.invalidateQueries(['models'])
      navigate('/models')
    },
    onError: (err) => {
      showError(err.message || '上传失败')
      setProgress(0)
      setStage('')
    },
  })

  const uploading = uploadMutation.isPending || uploadMutation.isLoading

  const validateModelFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_MODEL_TYPES.includes(ext)) {
      showError('不支持的文件类型，仅支持 ' + ALLOWED_MODEL_TYPES.join('/').toUpperCase())
      return false
    }
    if (file.size > MAX_FILE_SIZE) {
      showError(`文件过大，最大支持 ${formatFileSize(MAX_FILE_SIZE)}`)
      return false
    }
    return true
  }

  const validateThumbnail = (file) => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_IMAGE_TYPES.includes(ext)) {
      showError('缩略图仅支持 JPG/PNG/WebP')
      return false
    }
    if (file.size > 5 * 1024 * 1024) {
      showError('缩略图不能超过 5MB')
      return false
    }
    return true
  }

  const handleModelChange = (e) => {
    const file = e.target.files?.[0]
    if (file && validateModelFile(file)) {
      setModelFile(file)
      if (!name.trim()) {
        setName(file.name.replace(/\.[^.]+$/, ''))
      }
    }
  }

  const handleThumbnailChange = (e) => {
    const file = e.target.files?.[0]
    if (file && validateThumbnail(file)) {
      setThumbnailFile(file)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file && validateModelFile(file)) {
      setModelFile(file)
      if (!name.trim()) {
        setName(file.name.replace(/\.[^.]+$/, ''))
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) {
      showError('请输入模型名称')
      return
    }
    if (!modelFile) {
      showError('请选择模型文件')
      return
    }
    uploadMutation.mutate()
  }

  const removeModelFile = () => {
    setModelFile(null)
    if (modelInputRef.current) modelInputRef.current.value = ''
  }

  const removeThumbnail = () => {
    setThumbnailFile(null)
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = ''
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="上传 3D 模型"
        description="上传模型文件（GLTF/GLB/OBJ）与缩略图，小程序端可在线浏览"
        actions={
          <Button variant="outline" onClick={() => navigate('/models')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回列表
          </Button>
        }
      />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 基本信息 */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">模型名称 *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：DNA 双螺旋结构"
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
                  placeholder="请输入模型的用途、知识点关联等描述..."
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>

            {/* 模型文件 */}
            <div>
              <Label>模型文件 *（GLTF / GLB / OBJ，最大 {formatFileSize(MAX_FILE_SIZE)}）</Label>
              <div
                className={`mt-2 relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                  dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={modelInputRef}
                  type="file"
                  accept=".gltf,.glb,.obj"
                  onChange={handleModelChange}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <FileBox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                {modelFile ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">{modelFile.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatFileSize(modelFile.size)}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={(e) => { e.stopPropagation(); removeModelFile() }}>
                      <X className="h-3 w-3 mr-1" />
                      移除
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">拖拽文件到此处，或点击选择文件</p>
                    <p className="text-xs text-muted-foreground">推荐使用 GLB 格式，加载速度更快</p>
                  </div>
                )}
              </div>
            </div>

            {/* 缩略图 */}
            <div>
              <Label>缩略图（可选，JPG / PNG / WebP，最大 5MB）</Label>
              <div className="mt-2 relative rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center transition-colors hover:border-muted-foreground/50">
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleThumbnailChange}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <FileImage className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                {thumbnailFile ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">{thumbnailFile.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatFileSize(thumbnailFile.size)}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={(e) => { e.stopPropagation(); removeThumbnail() }}>
                      <X className="h-3 w-3 mr-1" />
                      移除
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">点击选择图片，建议正方形 ≥ 512×512</p>
                )}
              </div>
            </div>

            {/* 上传进度 */}
            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{stage}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* 提交 */}
            <div className="flex justify-end gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => navigate('/models')} disabled={uploading}>
                取消
              </Button>
              <Button type="submit" disabled={uploading || !name.trim() || !modelFile}>
                {uploading ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    上传中...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    上传模型
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 提示 */}
      <Card className="mt-4 border-blue-200 bg-blue-50">
        <CardContent className="flex gap-3 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">上传提示</p>
            <ul className="list-inside list-disc space-y-1">
              <li>受云函数请求体限制，单个模型文件最大 {formatFileSize(MAX_FILE_SIZE)}</li>
              <li>推荐使用 GLB 二进制格式，体积小且解析快</li>
              <li>文件将存储到云存储 models/ 目录，小程序端按需下载缓存</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
