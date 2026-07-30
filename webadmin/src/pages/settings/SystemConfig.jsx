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
import { Save, Settings, Plus, Trash2, Bot } from 'lucide-react'

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
  })
  const [newGrade, setNewGrade] = useState('')
  const [newTextbook, setNewTextbook] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: settingsApi.get,
    onSuccess: (data) => {
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
        })
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data) => settingsApi.update(data),
    onSuccess: () => {
      success('配置已更新')
    },
    onError: (err) => showError(err.message),
  })

  const handleSave = () => {
    updateMutation.mutate(config)
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
