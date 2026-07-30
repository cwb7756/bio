import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { quizApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Select } from '../../components/ui/select'
import PageHeader from '../../components/PageHeader'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'

const questionTypes = [
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
  { value: 'fill', label: '填空题' },
]

const difficulties = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]

export default function QuizEdit() {
  const { id: quizId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const isEdit = !!quizId

  const [form, setForm] = useState({
    stem: '',
    type: 'single',
    options: ['', '', '', ''],
    answer: '',
    explanation: '',
    chapter: '',
    difficulty: 'medium',
  })

  const { data: quiz } = useQuery({
    queryKey: ['quiz-detail', quizId],
    queryFn: () => quizApi.detail(quizId),
    enabled: isEdit,
    onSuccess: (data) => {
      if (data) {
        setForm({
          stem: data.stem || '',
          type: data.type === 'single' ? 'single' : data.type === 'multiple' ? 'multiple' : data.type === 'judge' ? 'judge' : 'fill',
          options: data.options?.length ? data.options : ['', '', '', ''],
          answer: data.answer || '',
          explanation: data.explanation || '',
          chapter: data.chapter || '',
          difficulty: 'medium', // backend doesn't store difficulty
        })
      }
    },
  })

  const saveMutation = useMutation({
    mutationFn: (data) => isEdit ? quizApi.update({ quizId, ...data }) : quizApi.create(data),
    onSuccess: () => {
      success(isEdit ? '题目已更新' : '题目已创建')
      queryClient.invalidateQueries(['quiz'])
      navigate('/quiz')
    },
    onError: (err) => showError(err.message),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.stem) {
      showError('请输入题干')
      return
    }
    if (form.type !== 'fill' && form.options.filter(Boolean).length < 2) {
      showError('至少需要2个选项')
      return
    }
    if (!form.answer) {
      showError('请输入正确答案')
      return
    }
    saveMutation.mutate({
      ...form,
      options: form.type === 'judge' ? ['正确', '错误'] : form.options.filter(Boolean),
    })
  }

  const addOption = () => setForm({ ...form, options: [...form.options, ''] })
  const removeOption = (i) => setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) })

  return (
    <div>
      <PageHeader
        title={isEdit ? '编辑题目' : '新建题目'}
        actions={
          <Button variant="outline" onClick={() => navigate('/quiz')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回列表
          </Button>
        }
      />

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>题目信息</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>题干 *</Label>
              <Textarea
                value={form.stem}
                onChange={(e) => setForm({ ...form, stem: e.target.value })}
                placeholder="请输入题目内容"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>题目类型</Label>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {questionTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>难度</Label>
                <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                  {difficulties.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>所属章节</Label>
                <Input
                  value={form.chapter}
                  onChange={(e) => setForm({ ...form, chapter: e.target.value })}
                  placeholder="如：细胞结构"
                />
              </div>
            </div>

            {/* 选项管理 */}
            {(form.type === 'single' || form.type === 'multiple') && (
              <div className="space-y-2">
                <Label>选项</Label>
                {form.options.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="flex h-10 w-8 items-center justify-center rounded-md border bg-muted text-sm font-medium">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const newOptions = [...form.options]
                        newOptions[i] = e.target.value
                        setForm({ ...form, options: newOptions })
                      }}
                      placeholder={`选项${String.fromCharCode(65 + i)}`}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => removeOption(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="h-4 w-4 mr-1" />
                  添加选项
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>正确答案 *</Label>
              {form.type === 'multiple' ? (
                <Input
                  value={form.answer}
                  onChange={(e) => setForm({ ...form, answer: e.target.value })}
                  placeholder="多选题答案用逗号分隔，如：A,B,C"
                />
              ) : form.type === 'judge' ? (
                <Select value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })}>
                  <option value="">请选择</option>
                  <option value="正确">正确</option>
                  <option value="错误">错误</option>
                </Select>
              ) : (
                <Input
                  value={form.answer}
                  onChange={(e) => setForm({ ...form, answer: e.target.value })}
                  placeholder={form.type === 'fill' ? '填空答案' : '如：A'}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>答案解析</Label>
              <Textarea
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                placeholder="答案解析说明"
                rows={3}
              />
            </div>

            <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? '保存中...' : '保存题目'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
