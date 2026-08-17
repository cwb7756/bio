import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiQuizApi, quizApi, settingsApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../hooks/useAuth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Select } from '../../components/ui/select'
import { Badge } from '../../components/ui/badge'
import PageHeader from '../../components/PageHeader'
import {
  Sparkles, Play, Pause, X, Plus, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, ArrowLeft, Settings, KeyRound, Zap,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const chapters = ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三']

const typeOptions = [
  { value: 'single', label: '单选题' },
  { value: 'judge', label: '判断题' },
  { value: 'mixed', label: '混合（单选 + 判断）' },
]

const difficultyOptions = [
  { value: 'mixed', label: '混合难度' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]

const typeLabels = { single: '单选题', judge: '判断题', mixed: '混合' }
const difficultyLabels = { easy: '简单', medium: '中等', hard: '困难', mixed: '混合' }

const jobStatusConfig = {
  running: { label: '生成中', variant: 'default' },
  done: { label: '已完成', variant: 'success' },
  failed: { label: '失败', variant: 'destructive' },
  cancelled: { label: '已取消', variant: 'secondary' },
}

const questionStatusConfig = {
  pending: { label: '待审核', variant: 'warning' },
  approved: { label: '已上线', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'destructive' },
}

// 选项渲染：兼容 {key,text} 对象与纯字符串两种存量格式
function renderOption(o, i) {
  if (typeof o === 'string') return `${String.fromCharCode(65 + i)}. ${o}`
  return `${o.key}. ${o.text}`
}

export default function AiQuizGen() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const navigate = useNavigate()
  const { isSuperAdmin } = useAuth()

  const [form, setForm] = useState({
    chapter: '必修一',
    customChapter: '',
    topic: '',
    type: 'single',
    difficulty: 'mixed',
    count: 10,
    extra: '',
  })
  const [job, setJob] = useState(null)
  const [paused, setPaused] = useState(false)
  const [batchError, setBatchError] = useState('')
  // DeepSeek API Key 内联添加（未配置时超级管理员可直接在未页保存）
  const [apiKeyInput, setApiKeyInput] = useState('')

  // tick 循环控制（ref 避免闭包过期）
  const tickingRef = useRef(false)
  const jobRef = useRef(null)
  const didInitRef = useRef(false)

  // DeepSeek 配置状态（settings.get 返回脱敏信息，已配置时仅含掩码）
  const { data: settingsData, refetch: refetchSettings } = useQuery({
    queryKey: ['system-config'],
    queryFn: settingsApi.get,
  })
  const deepseek = settingsData?.deepseek || { hasKey: false, keyMasked: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' }

  // 任务列表
  const { data: jobsData, refetch: refetchJobs } = useQuery({
    queryKey: ['ai-quiz-jobs'],
    queryFn: aiQuizApi.list,
  })

  // 当前任务的生成题目
  const { data: questionsData, refetch: refetchQuestions } = useQuery({
    queryKey: ['ai-quiz-questions', job?._id],
    queryFn: () => quizApi.list({ jobId: job._id, page: 1, pageSize: 100 }),
    enabled: !!job?._id,
  })

  const questions = questionsData?.list || []

  // 单次 tick：生成一批并刷新进度
  const runTick = useCallback(async () => {
    const current = jobRef.current
    if (tickingRef.current || !current || current.status !== 'running') return
    tickingRef.current = true
    try {
      const res = await aiQuizApi.tick(current._id)
      jobRef.current = res.job
      setJob(res.job)
      setBatchError(res.batchError || '')
      refetchQuestions()
      if (res.job && res.job.status === 'done') {
        success(`生成完成：成功 ${res.job.generated} 题，失败 ${res.job.failed} 题`)
        refetchJobs()
      }
    } catch (err) {
      setBatchError(err.message || '生成分批中断，可点击继续重试')
      setPaused(true)
    } finally {
      tickingRef.current = false
    }
  }, [refetchQuestions, refetchJobs, success])

  // tick 轮询循环：job 运行中且未暂停时，每 1.5s 驱动一次
  useEffect(() => {
    if (!job || job.status !== 'running' || paused) return
    const timer = setTimeout(() => { runTick() }, 1500)
    return () => clearTimeout(timer)
  }, [job, paused, runTick])

  // 首次进入：若有运行中的任务自动载入续跑
  useEffect(() => {
    if (didInitRef.current || !jobsData?.list) return
    didInitRef.current = true
    const running = jobsData.list.find((j) => j.status === 'running')
    if (running && !jobRef.current) {
      jobRef.current = running
      setJob(running)
      setPaused(false)
    }
  }, [jobsData])

  // 创建任务
  const createMutation = useMutation({
    mutationFn: async () => {
      const chapter = form.chapter === '__custom' ? form.customChapter.trim() : form.chapter
      if (!chapter && !form.topic.trim()) {
        throw new Error('请至少填写教材章节或出题方向')
      }
      return aiQuizApi.create({
        chapter,
        topic: form.topic.trim(),
        type: form.type,
        difficulty: form.difficulty,
        count: Number(form.count) || 10,
        extra: form.extra.trim(),
      })
    },
    onSuccess: (data) => {
      jobRef.current = data.job
      setJob(data.job)
      setPaused(false)
      setBatchError('')
      success('任务已创建，开始生成')
      refetchJobs()
    },
    onError: (err) => showError(err.message || '创建任务失败'),
  })

  // 取消任务
  const cancelMutation = useMutation({
    mutationFn: () => aiQuizApi.cancel(job._id),
    onSuccess: (data) => {
      jobRef.current = data.job
      setJob(data.job)
      success('任务已取消')
      refetchJobs()
    },
    onError: (err) => showError(err.message || '取消失败'),
  })

  // 单题审核
  const reviewOneMutation = useMutation({
    mutationFn: ({ questionId, status }) => quizApi.update({ questionId, status }),
    onSuccess: () => refetchQuestions(),
    onError: (err) => showError(err.message || '操作失败'),
  })

  // 批量审核本任务全部待审核题
  const batchReviewMutation = useMutation({
    mutationFn: (action) => {
      const ids = questions.filter((q) => q.status === 'pending').map((q) => q._id)
      if (ids.length === 0) throw new Error('没有待审核的题目')
      return quizApi.batchReview(ids, action)
    },
    onSuccess: (data) => {
      success(data?.updated ? `已处理 ${data.updated} 条题目` : '处理完成')
      refetchQuestions()
      queryClient.invalidateQueries(['quiz'])
    },
    onError: (err) => showError(err.message || '批量审核失败'),
  })

  // 保存 API Key（仅超级管理员，settings.update 服务端校验 superadmin）
  const saveKeyMutation = useMutation({
    mutationFn: () => settingsApi.update({ deepseekApiKey: apiKeyInput.trim() }),
    onSuccess: () => {
      success('API Key 已保存')
      setApiKeyInput('')
      refetchSettings()
    },
    onError: (err) => showError(err.message || '保存失败'),
  })

  // 连接测试（需已保存 Key）
  const testDeepseekMutation = useMutation({
    mutationFn: settingsApi.testDeepseek,
    onSuccess: (res) => success(`连接成功（当前模型：${res?.model || deepseek.model}）`),
    onError: (err) => showError(err.message || '连接失败'),
  })

  const handleCreate = () => {
    // 未配置 API Key 时拦截并提示
    if (!deepseek.hasKey) {
      showError('请先添加 DeepSeek API Key 再开始生成')
      return
    }
    createMutation.mutate()
  }

  // ---------- 渲染 ----------

  const processed = job ? (job.generated || 0) + (job.failed || 0) : 0
  const percent = job && job.total ? Math.min(100, Math.round((processed / job.total) * 100)) : 0
  const pendingCount = questions.filter((q) => q.status === 'pending').length

  return (
    <div>
      <PageHeader
        title="AI 出题"
        description="基于 DeepSeek 大模型按方向批量命制试题，生成后需人工审核上线"
        actions={
          <div className="flex gap-2">
            {job && (
              <Button variant="outline" onClick={() => { jobRef.current = null; setJob(null); setBatchError('') }}>
                <Plus className="h-4 w-4 mr-2" />
                新建任务
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/quiz')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              题库管理
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左侧：表单 或 进度 */}
        <div className="lg:col-span-2 space-y-6">
          {!job ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  出题设置
                </CardTitle>
                <CardDescription>AI 将按批次生成题目（每批 5 题），生成过程中可暂停或取消</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>教材章节 *</Label>
                    <Select
                      value={form.chapter}
                      onChange={(e) => setForm({ ...form, chapter: e.target.value })}
                    >
                      {chapters.map((c) => <option key={c} value={c}>{c}</option>)}
                      <option value="__custom">自定义…</option>
                    </Select>
                    {form.chapter === '__custom' && (
                      <Input
                        value={form.customChapter}
                        onChange={(e) => setForm({ ...form, customChapter: e.target.value })}
                        placeholder="输入自定义章节，如：必修一 细胞分子组成"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>出题方向 / 考点</Label>
                    <Input
                      value={form.topic}
                      onChange={(e) => setForm({ ...form, topic: e.target.value })}
                      placeholder="如：细胞呼吸、光合作用"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>题型</Label>
                    <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                      {typeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>难度</Label>
                    <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                      {difficultyOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>数量（1-100）</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={form.count}
                      onChange={(e) => setForm({ ...form, count: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>补充要求（可选）</Label>
                  <Textarea
                    value={form.extra}
                    onChange={(e) => setForm({ ...form, extra: e.target.value })}
                    placeholder="如：侧重实验设计与数据分析，结合高考真题风格"
                    rows={2}
                  />
                </div>

                <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full">
                  <Sparkles className="h-4 w-4 mr-2" />
                  {createMutation.isPending ? '创建中...' : '开始生成'}
                </Button>

                {!deepseek.hasKey && (
                  <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>尚未配置 DeepSeek API Key，请在右侧「DeepSeek 配置」卡片中添加后再开始生成。</span>
                  </div>
                )}

                {createMutation.isError && /API Key/i.test(createMutation.error?.message || '') && (
                  <div className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                    <span>{createMutation.error.message}</span>
                    <Button size="sm" variant="outline" onClick={() => navigate('/settings/config')}>
                      <Settings className="h-4 w-4 mr-1" />
                      前往配置
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  生成进度
                  {jobStatusConfig[job.status] && (
                    <Badge variant={jobStatusConfig[job.status].variant}>{jobStatusConfig[job.status].label}</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {[job.params?.chapter, job.params?.topic].filter(Boolean).join(' · ') || '未指定方向'}
                  {'　'}题型：{typeLabels[job.params?.type] || '单选题'}　难度：{difficultyLabels[job.params?.difficulty] || '混合'}
                  {'　'}模型：{job.model}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 进度条 */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{processed} / {job.total}</span>
                    <span className="text-muted-foreground">
                      成功 {job.generated || 0} · 失败 {job.failed || 0} · 剩余 {Math.max(0, job.total - processed)}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${job.status === 'failed' ? 'bg-red-500' : 'bg-primary'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                {/* 操作按钮 */}
                {job.status === 'running' && (
                  <div className="flex gap-2">
                    {!paused ? (
                      <Button variant="outline" size="sm" onClick={() => setPaused(true)}>
                        <Pause className="h-4 w-4 mr-1" />
                        暂停生成
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setPaused(false)}>
                        <Play className="h-4 w-4 mr-1" />
                        继续生成
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                      <X className="h-4 w-4 mr-1" />
                      取消任务
                    </Button>
                  </div>
                )}

                {/* 错误提示 */}
                {batchError && job.status === 'running' && (
                  <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{batchError}</span>
                  </div>
                )}
                {job.status === 'failed' && job.error && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{job.error}</span>
                  </div>
                )}
                {paused && job.status === 'running' && (
                  <p className="text-sm text-muted-foreground">已暂停。任务进度已保存，点击"继续生成"可断点续跑。</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* 生成结果实时预览（选中任务时） */}
          {job && (
            <Card>
              <CardHeader>
                <CardTitle>生成结果（{questions.length} 题，待审核 {pendingCount} 题）</CardTitle>
                <CardDescription>审核通过的题目才会对小程序用户可见</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingCount > 0 && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => batchReviewMutation.mutate('approve')} disabled={batchReviewMutation.isPending}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      全部通过上线
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => batchReviewMutation.mutate('reject')} disabled={batchReviewMutation.isPending}>
                      <XCircle className="h-4 w-4 mr-1" />
                      全部拒绝
                    </Button>
                  </div>
                )}
                {questions.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">暂无生成结果，等待首批完成…</p>
                )}
                {questions.map((q) => (
                  <div key={q._id} className="rounded-lg border p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {questionStatusConfig[q.status] ? (
                          <Badge variant={questionStatusConfig[q.status].variant}>{questionStatusConfig[q.status].label}</Badge>
                        ) : (
                          <Badge variant="success">已上线</Badge>
                        )}
                        <Badge variant="outline">{difficultyLabels[q.difficulty] || '中等'}</Badge>
                      </div>
                      {q.status === 'pending' && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => reviewOneMutation.mutate({ questionId: q._id, status: 'approved' })}
                            disabled={reviewOneMutation.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reviewOneMutation.mutate({ questionId: q._id, status: 'rejected' })}
                            disabled={reviewOneMutation.isPending}
                          >
                            <XCircle className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="mb-2 text-sm font-medium">{q.stem}</p>
                    <ul className="mb-2 space-y-1 text-sm text-muted-foreground">
                      {(q.options || []).map((o, i) => (
                        <li key={i} className={String(q.answer || '').includes(typeof o === 'string' ? String.fromCharCode(65 + i) : o.key) ? 'text-green-600 font-medium' : ''}>
                          {renderOption(o, i)}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">答案：{q.answer}</span>
                      {q.explanation ? `　解析：${q.explanation}` : ''}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：DeepSeek 配置 + 历史任务 */}
        <div className="space-y-6">
          {/* DeepSeek 配置入口：未配置时可在此直接添加（仅超级管理员） */}
          <Card className={!deepseek.hasKey ? 'border-red-200' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                DeepSeek 配置
                {deepseek.hasKey
                  ? <Badge variant="success">已配置</Badge>
                  : <Badge variant="destructive">未配置</Badge>}
              </CardTitle>
              <CardDescription>
                {deepseek.hasKey
                  ? `Key：${deepseek.keyMasked} · 模型：${deepseek.model}`
                  : '尚未配置 API Key，配置后才能使用 AI 出题'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {deepseek.hasKey ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testDeepseekMutation.mutate()}
                    disabled={testDeepseekMutation.isPending}
                  >
                    <Zap className="h-4 w-4 mr-1" />
                    {testDeepseekMutation.isPending ? '测试中...' : '测试连接'}
                  </Button>
                  {isSuperAdmin && (
                    <Button variant="ghost" size="sm" onClick={() => navigate('/settings/config')}>
                      <Settings className="h-4 w-4 mr-1" />
                      更多设置
                    </Button>
                  )}
                </div>
              ) : isSuperAdmin ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="输入 sk- 开头的 API Key"
                    />
                    <Button
                      size="sm"
                      className="flex-shrink-0"
                      onClick={() => saveKeyMutation.mutate()}
                      disabled={!apiKeyInput.trim() || saveKeyMutation.isPending}
                    >
                      {saveKeyMutation.isPending ? '保存中...' : '保存'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    仅超级管理员可配置；模型与接口地址可在「系统设置 → 系统配置」中调整。
                  </p>
                </>
              ) : (
                <p className="text-sm text-yellow-800">尚未配置 DeepSeek API Key，请联系超级管理员添加。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                历史任务
              </CardTitle>
              <CardDescription>点击任务查看其生成结果；运行中的任务可续跑</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(jobsData?.list || []).length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">暂无任务</p>
              )}
              {(jobsData?.list || []).map((j) => (
                <button
                  key={j._id}
                  onClick={() => {
                    jobRef.current = j
                    setJob(j)
                    setPaused(j.status !== 'running')
                    setBatchError('')
                  }}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent ${
                    job?._id === j._id ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">
                      {[j.params?.chapter, j.params?.topic].filter(Boolean).join(' · ') || '未指定方向'}
                    </span>
                    {jobStatusConfig[j.status] && (
                      <Badge variant={jobStatusConfig[j.status].variant}>{jobStatusConfig[j.status].label}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {j.generated || 0}/{j.total} 题 · {typeLabels[j.params?.type] || '单选题'} · {difficultyLabels[j.params?.difficulty] || '混合'}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {j.createdByName || '未知'} · {j.createdAt ? new Date(j.createdAt).toLocaleString('zh-CN') : ''}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>使用说明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. 需先在上方「DeepSeek 配置」卡片（或系统设置）中添加 API Key。</p>
              <p>2. 每批生成 5 题，页面需保持打开以驱动生成进度；关闭后可从历史任务断点续跑。</p>
              <p>3. 生成的题目初始为「待审核」状态，审核通过前小程序用户不可见。</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
