import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { quizApi } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/textarea'
import { Badge } from '../../components/ui/badge'
import PageHeader from '../../components/PageHeader'
import { ArrowLeft, Upload, CheckCircle, AlertCircle } from 'lucide-react'

const exampleJson = `[
  {
    "question": "细胞膜的基本骨架是？",
    "type": "single",
    "options": ["磷脂双分子层", "蛋白质", "糖蛋白", "胆固醇"],
    "answer": "A",
    "analysis": "细胞膜的基本骨架是磷脂双分子层。",
    "chapter": "细胞结构",
    "difficulty": "easy"
  }
]`

export default function QuizImport() {
  const navigate = useNavigate()
  const { success, error: showError } = useToast()
  const [jsonText, setJsonText] = useState('')
  const [importResult, setImportResult] = useState(null)

  const importMutation = useMutation({
    mutationFn: async (questions) => {
      // 分批提交，每批50条
      const batchSize = 50
      const results = []
      for (let i = 0; i < questions.length; i += batchSize) {
        const batch = questions.slice(i, i + batchSize)
        const res = await quizApi.batchImport(batch)
        results.push(res)
      }
      return results
    },
    onSuccess: (results) => {
      const totalImported = results.reduce((sum, r) => sum + (r.imported || r.count || 0), 0)
      success(`成功导入 ${totalImported} 道题目`)
      setImportResult({ success: true, count: totalImported })
    },
    onError: (err) => {
      showError(err.message || '导入失败')
      setImportResult({ success: false, error: err.message })
    },
  })

  const handleImport = () => {
    try {
      const questions = JSON.parse(jsonText)
      if (!Array.isArray(questions)) {
        showError('JSON 格式错误：应为数组')
        return
      }
      if (questions.length === 0) {
        showError('没有题目数据')
        return
      }
      setImportResult(null)
      importMutation.mutate(questions)
    } catch (err) {
      showError('JSON 解析失败：' + err.message)
    }
  }

  const handleLoadExample = () => {
    setJsonText(exampleJson)
  }

  return (
    <div>
      <PageHeader
        title="批量导入题目"
        description="通过 JSON 格式批量导入题目"
        actions={
          <Button variant="outline" onClick={() => navigate('/quiz')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回列表
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>题目数据</CardTitle>
            <CardDescription>粘贴 JSON 格式的题目数据</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder="粘贴 JSON 格式的题目数组..."
              className="min-h-[400px] font-mono text-sm"
            />
            <div className="mt-4 flex gap-2">
              <Button onClick={handleImport} disabled={!jsonText || importMutation.isPending}>
                <Upload className="h-4 w-4 mr-2" />
                {importMutation.isPending ? '导入中...' : '开始导入'}
              </Button>
              <Button variant="outline" onClick={handleLoadExample}>
                加载示例
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 格式说明 */}
        <Card>
          <CardHeader>
            <CardTitle>格式说明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium mb-1">字段说明：</p>
              <ul className="space-y-1 text-muted-foreground">
                <li><code className="text-xs bg-muted px-1 rounded">question</code> - 题干（必填）</li>
                <li><code className="text-xs bg-muted px-1 rounded">type</code> - 类型：single/multiple/judge/fill</li>
                <li><code className="text-xs bg-muted px-1 rounded">options</code> - 选项数组</li>
                <li><code className="text-xs bg-muted px-1 rounded">answer</code> - 正确答案（必填）</li>
                <li><code className="text-xs bg-muted px-1 rounded">analysis</code> - 答案解析</li>
                <li><code className="text-xs bg-muted px-1 rounded">chapter</code> - 所属章节</li>
                <li><code className="text-xs bg-muted px-1 rounded">difficulty</code> - 难度：easy/medium/hard</li>
              </ul>
            </div>
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                单选题答案：A / B / C / D<br/>
                多选题答案：A,B,C / A,B<br/>
                判断题答案：正确 / 错误
              </p>
            </div>
            <div>
              <Badge variant="secondary">每批50条自动分批提交</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 导入结果 */}
      {importResult && (
        <Card className="mt-6">
          <CardContent className="p-4">
            {importResult.success ? (
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <div>
                  <p className="font-medium">导入成功</p>
                  <p className="text-sm text-muted-foreground">共导入 {importResult.count} 道题目</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-red-500" />
                <div>
                  <p className="font-medium">导入失败</p>
                  <p className="text-sm text-muted-foreground">{importResult.error}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
