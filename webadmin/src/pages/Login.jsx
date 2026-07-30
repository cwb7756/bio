import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card'
import { GraduationCap } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { error: showError } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showErrorToast, setShowErrorToast] = useState(false)

  // 检测登录过期标志并显示提示
  useEffect(() => {
    const authError = localStorage.getItem('auth-error')
    if (authError) {
      setShowErrorToast(true)
      setTimeout(() => {
        localStorage.removeItem('auth-error')
        setShowErrorToast(false)
      }, 5000)
    }
    // 清空 auth-error 标志，避免刷新后一直显示
    if (username || password) {
      localStorage.removeItem('auth-error')
      setShowErrorToast(false)
    }
  }, [username, password])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) {
      showError('请输入用户名和密码')
      return
    }
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      showError(err.response?.data?.message || err.message || '登录失败，请检查用户名和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary">
            <GraduationCap className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">后台管理系统</CardTitle>
          <CardDescription>高中生物学习小程序管理平台</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                type="text"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
