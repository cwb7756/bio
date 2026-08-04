import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { FileQuestion, Home, LogIn } from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-md text-center">
        <CardContent className="px-8 pb-8 pt-10">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
            <FileQuestion className="h-10 w-10 text-amber-600" />
          </div>
          <div className="text-6xl font-bold text-slate-800">404</div>
          <p className="mt-3 text-lg font-medium text-slate-700">页面不存在</p>
          <p className="mt-1 text-sm text-muted-foreground">您访问的页面不存在或已被移除</p>
          <div className="mt-8 flex justify-center gap-3">
            {isAuthenticated ? (
              <Button onClick={() => navigate('/')}>
                <Home className="h-4 w-4 mr-2" /> 返回首页
              </Button>
            ) : (
              <Button onClick={() => navigate('/login')}>
                <LogIn className="h-4 w-4 mr-2" /> 去登录
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
