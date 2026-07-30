import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { courseApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Select } from '../../components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../components/ui/table'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { ArrowLeft, Plus, Edit, Trash2, Save } from 'lucide-react'

const grades = ['高一', '高二', '高三']
const textbooks = ['必修一', '必修二', '选择性必修一', '选择性必修二', '选择性必修三']

export default function CourseEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const isEdit = !!id

  const [form, setForm] = useState({
    title: '',
    grade: '',
    textbook: '',
    description: '',
    coverUrl: '',
  })
  const [lessonForm, setLessonForm] = useState({ title: '', videoId: '', sort: 0 })
  const [editingLessonId, setEditingLessonId] = useState(null)
  const [deleteLessonId, setDeleteLessonId] = useState(null)

  const { data: response } = useQuery({
    queryKey: ['course', id],
    queryFn: () => courseApi.detail(id),
    enabled: isEdit,
    onSuccess: (data) => {
      if (data?.course) {
        // Form fields match backend schema
        setForm({
          title: data.course.title || '',
          grade: data.course.level || '',  // map level -> grade
          textbook: data.course.chapter || '',  // map chapter -> textbook
          description: data.course.tag || '',  // map tag -> description
          coverUrl: data.course.icon || '',  // map icon -> coverUrl (use icon as placeholder)
        })
      }
    },
  })

  const { data: lessonsData } = useQuery({
    queryKey: ['lessons', id],
    queryFn: () => courseApi.lessonList(id),
    enabled: isEdit,
  })

  // Extract lessons list from API response structure
  const lessons = lessonsData?.list || []

  const saveCourseMutation = useMutation({
    mutationFn: (data) => isEdit ? courseApi.update({ courseId: id, ...data }) : courseApi.create(data),
    onSuccess: () => {
      success(isEdit ? '课程已更新' : '课程已创建')
      queryClient.invalidateQueries(['courses'])
      if (!isEdit) navigate('/courses')
    },
    onError: (err) => showError(err.message),
  })

  const saveLessonMutation = useMutation({
    mutationFn: (data) => editingLessonId
      ? courseApi.lessonUpdate({ courseId: id, lessonId: editingLessonId, ...data })
      : courseApi.lessonCreate({ courseId: id, ...data }),
    onSuccess: () => {
      success(editingLessonId ? '课时已更新' : '课时已添加')
      queryClient.invalidateQueries(['lessons', id])
      setLessonForm({ title: '', videoId: '', sort: 0 })
      setEditingLessonId(null)
    },
    onError: (err) => showError(err.message),
  })

  const deleteLessonMutation = useMutation({
    mutationFn: (lessonId) => courseApi.lessonDelete({ courseId: id, lessonId }),
    onSuccess: () => {
      success('课时已删除')
      queryClient.invalidateQueries(['lessons', id])
      setDeleteLessonId(null)
    },
    onError: (err) => showError(err.message),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title) {
      showError('请输入课程名称')
      return
    }
    saveCourseMutation.mutate(form)
  }

  const handleLessonSubmit = (e) => {
    e.preventDefault()
    if (!lessonForm.title) {
      showError('请输入课时标题')
      return
    }
    saveLessonMutation.mutate(lessonForm)
  }

  const startEditLesson = (lesson) => {
    setEditingLessonId(lesson._id)
    setLessonForm({ title: lesson.title, videoId: lesson.videoId || '', sort: lesson.sort || 0 })
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? '编辑课程' : '新建课程'}
        actions={
          <Button variant="outline" onClick={() => navigate('/courses')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回列表
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 课程信息 */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>课程信息</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>课程名称 *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="如：细胞的分子组成"
                />
              </div>
              <div className="space-y-2">
                <Label>年级</Label>
                <Select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                  <option value="">请选择</option>
                  {grades.map((g) => <option key={g} value={g}>{g}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>教材分册</Label>
                <Select value={form.textbook} onChange={(e) => setForm({ ...form, textbook: e.target.value })}>
                  <option value="">请选择</option>
                  {textbooks.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>课程描述</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="课程简要描述"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>封面图片URL</Label>
                <Input
                  value={form.coverUrl}
                  onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <Button type="submit" className="w-full" disabled={saveCourseMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {saveCourseMutation.isPending ? '保存中...' : '保存课程'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 课时管理 */}
        {isEdit && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>课时管理</CardTitle>
              <CardDescription>添加、编辑或删除课时</CardDescription>
            </CardHeader>
            <CardContent>
              {/* 添加/编辑课时表单 */}
              <form onSubmit={handleLessonSubmit} className="mb-6 space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{editingLessonId ? '编辑课时' : '添加课时'}</h4>
                  {editingLessonId && (
                    <Button variant="ghost" size="sm" onClick={() => { setEditingLessonId(null); setLessonForm({ title: '', videoId: '', sort: 0 }) }}>
                      取消
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">课时标题</Label>
                    <Input
                      value={lessonForm.title}
                      onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                      placeholder="如：蛋白质"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">排序</Label>
                    <Input
                      type="number"
                      value={lessonForm.sort}
                      onChange={(e) => setLessonForm({ ...lessonForm, sort: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">视频 ID（可选）</Label>
                  <Input
                    value={lessonForm.videoId}
                    onChange={(e) => setLessonForm({ ...lessonForm, videoId: e.target.value })}
                    placeholder="cloud-xxxxxxx"
                  />
                </div>
                <Button type="submit" size="sm" disabled={saveLessonMutation.isPending}>
                  <Plus className="h-4 w-4 mr-1" />
                  {editingLessonId ? '更新' : '添加'}
                </Button>
              </form>

              {/* 课时列表 */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">排序</TableHead>
                    <TableHead>标题</TableHead>
                    <TableHead className="text-sm text-muted-foreground">视频 ID</TableHead>
                    <TableHead className="w-24">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lessons?.list || lessons || []).map((lesson) => (
                    <TableRow key={lesson._id}>
                      <TableCell>{lesson.sort || 0}</TableCell>
                      <TableCell className="font-medium">{lesson.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-xs">
                        {lesson.videoId != null ? lesson.videoId : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => startEditLesson(lesson)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteLessonId(lesson._id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!lessons?.list && !lessons) || (lessons?.list?.length === 0 && lessons?.length === 0) ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        暂无课时
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteLessonId}
        onOpenChange={() => setDeleteLessonId(null)}
        title="删除课时"
        description="确定要删除该课时吗？"
        confirmText="删除"
        onConfirm={() => deleteLessonMutation.mutate(deleteLessonId)}
      />
    </div>
  )
}
