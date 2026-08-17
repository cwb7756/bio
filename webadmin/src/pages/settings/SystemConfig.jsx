import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { settingsApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Select } from '../../components/ui/select'
import { Badge } from '../../components/ui/badge'
import PageHeader from '../../components/PageHeader'
import { Save, Settings, Plus, Trash2, Bot, KeyRound, Zap } from 'lucide-react'

const DEFAULT_DEEPSEEK = {
  hasKey: false,
  keyMasked: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
}

export default function SystemConfig() {
  const { success, error: showError } = useToast()

  const [config, setConfig] = useState({
    grades: ['高一', '高二', '高三'],
    textbooks: ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三'],
    aiModel: 'hunyuan-v3',
    aiProvider: 'tencent',
    globalSwitches: {
      enableRegistration: true,
      enableAI: true,
      enablePet: true,
      enableAchievements: true,
    },
    announcement: '',
    deepseek: DEFAULT_DEEPSEEK,
  })
  const [newGrade, setNewGrade] = useState('')
  const [newTextbook, setNewTextbook] = useState('')
  // DeepSeek API Key 输入框（留空保存 = 不修改已配置的 key）
  const [apiKeyInput, setApiKeyInput] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: settingsApi.get,
  })

  // TanStack Query v5 已移除 useQuery 的 onSuccess，改用 useEffect 回填表单
  useEffect(() => {
    if (data) {
      setConfig({
        grades: data.grades || ['高一', '高二', '高三'],
        textbooks: data.textbooks || ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三'],
        aiModel: data.aiModel || 'hunyuan-v3',
        aiProvider: data.aiProvider || 'tencent',
        globalSwitches: data.globalSwitches || {
          enableRegistration: true,
          enableAI: true,
          enablePet: true,
          enableAchievements: true,
        },
        announcement: data.announcement || '',
        deepseek: data.deepseek || DEFAULT_DEEPSEEK,
      })
    }
  }, [data])

  const updateMutation = useMutation({
    mutationFn: (data) => settingsApi.update(data),
    onSuccess: () => {
      success('配置已更新')
      setApiKeyInput('')
    },
    onError: (err) => showError(err.message),
  })

  // DeepSeek 连接测试（需先保存配置）
  const testDeepseekMutation = useMutation({
    mutationFn: settingsApi.testDeepseek,
    onSuccess: (res) => {
      success(`连接成功（当前模型：${res?.model || config.deepseek.model}）`)
    },
    onError: (err) => showError(err.message || '连接失败'),
  })

  const handleSave = () => {
    // deepseek 子对象为脱敏展示值，不入库；仅提交用户输入的新 key 与派生配置
    const { deepseek, ...rest } = config
    const payload = {
      ...rest,
      deepseekBaseUrl: deepseek.baseUrl,
      deepseekModel: deepseek.model,
    }
    if (apiKeyInput.trim()) payload.deepseekApiKey = apiKeyInput.trim()
    updateMutation.mutate(payload)
  }

  const addGrade = () => {
    if (newGrade && !config.grades.includes(newGrade)) {
      setConfig({ ...config, grades: [...config.grades, newGrade] })
      setNewGrade('')
    }
  }

  const removeGrade = (g) => {
    setConfig({ ...config, grades: config.grades.filter((x) => x !== g) })
  }

  const addTextbook = () => {
    if (newTextbook && !config.textbooks.includes(newTextbook)) {
      setConfig({ ...config, textbooks: [...config.textbooks, newTextbook] })
      setNewTextbook('')
    }
  }

  const removeTextbook = (t) => {
    setConfig({ ...config, textbooks: config.textbooks.filter((x) => x !== t) })
  }

  const toggleSwitch = (key) => {
    setConfig({
      ...config,
      globalSwitches: { ...config.globalSwitches, [key]: !config.globalSwitches[key] },
    })
  }

  return (
    <div>
      <PageHeader
        title="系统配置"
        description="管理系统全局配置"
        actions={
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? '保存中...' : '保存配置'}
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 年级选项管理 */}
          <Card>
            <CardHeader>
              <CardTitle>年级选项</CardTitle>
              <CardDescription>小程序端显示的年级列表</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {config.grades.map((g) => (
                  <Badge key={g} variant="secondary" className="flex items-center gap-1">
                    {g}
                    <button onClick={() => removeGrade(g)} className="ml-1">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newGrade}
                  onChange={(e) => setNewGrade(e.target.value)}
                  placeholder="新年级"
                  onKeyDown={(e) => e.key === 'Enter' && addGrade()}
                />
                <Button size="sm" onClick={addGrade}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 教材分册管理 */}
          <Card>
            <CardHeader>
              <CardTitle>教材分册</CardTitle>
              <CardDescription>小程序端显示的教材分册列表</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {config.textbooks.map((t) => (
                  <Badge key={t} variant="secondary" className="flex items-center gap-1">
                    {t}
                    <button onClick={() => removeTextbook(t)} className="ml-1">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTextbook}
                  onChange={(e) => setNewTextbook(e.target.value)}
                  placeholder="新教材分册"
                  onKeyDown={(e) => e.key === 'Enter' && addTextbook()}
                />
                <Button size="sm" onClick={addTextbook}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI 模型配置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                AI 模型配置
              </CardTitle>
              <CardDescription>配置 AI 答疑与课件生成使用的模型</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>AI 提供商</Label>
                <Select
                  value={config.aiProvider}
                  onChange={(e) => setConfig({ ...config, aiProvider: e.target.value })}
                >
                  <option value="tencent">腾讯云</option>
                  <option value="openai">OpenAI</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>AI 模型</Label>
                <Select
                  value={config.aiModel}
                  onChange={(e) => setConfig({ ...config, aiModel: e.target.value })}
                >
                  <option value="hunyuan-v3">混元 v3（默认免费）</option>
                  <option value="hy3-preview">hy3-preview（免费预览）</option>
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 全局开关 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                全局开关
              </CardTitle>
              <CardDescription>控制各功能模块的启用状态</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(config.globalSwitches).map(([key, value]) => {
                const labels = {
                  enableRegistration: '开放注册',
                  enableAI: 'AI 功能',
                  enablePet: '宠物养成',
                  enableAchievements: '成就系统',
                }
                return (
                  <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="text-sm font-medium">{labels[key] || key}</span>
                    <button
                      onClick={() => toggleSwitch(key)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        value ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                          value ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* DeepSeek 出题配置 */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                DeepSeek 出题配置
              </CardTitle>
              <CardDescription>
                AI 一键出题使用的 DeepSeek 接口。旧模型名 deepseek-chat / deepseek-reasoner 已于 2026-07 弃用；
                计费采用峰谷定价（闲时半价），建议闲时批量出题
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={config.deepseek.hasKey ? `已配置（${config.deepseek.keyMasked}），留空则不修改` : '未配置，请输入 sk- 开头的 Key'}
                />
                {config.deepseek.hasKey && !apiKeyInput && (
                  <p className="text-xs text-muted-foreground">当前已配置：{config.deepseek.keyMasked}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>接口地址</Label>
                <Input
                  value={config.deepseek.baseUrl}
                  onChange={(e) => setConfig({ ...config, deepseek: { ...config.deepseek, baseUrl: e.target.value } })}
                  placeholder="https://api.deepseek.com"
                />
              </div>
              <div className="space-y-2">
                <Label>模型</Label>
                <Select
                  value={config.deepseek.model}
                  onChange={(e) => setConfig({ ...config, deepseek: { ...config.deepseek, model: e.target.value } })}
                >
                  <option value="deepseek-v4-flash">deepseek-v4-flash（推荐，快速低价）</option>
                  <option value="deepseek-v4-pro">deepseek-v4-pro（更强，适合困难推理题）</option>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => testDeepseekMutation.mutate()}
                  disabled={testDeepseekMutation.isPending}
                >
                  <Zap className="h-4 w-4 mr-1" />
                  {testDeepseekMutation.isPending ? '测试中...' : '测试连接（需先保存）'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 公告 */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>系统公告</CardTitle>
              <CardDescription>展示在小程序首页的公告内容</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={config.announcement}
                onChange={(e) => setConfig({ ...config, announcement: e.target.value })}
                placeholder="输入公告内容（留空则不显示公告）"
                rows={3}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
