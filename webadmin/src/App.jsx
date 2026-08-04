import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Dashboard from './pages/Dashboard'
import UserList from './pages/users/UserList'
import UserDetail from './pages/users/UserDetail'
import CourseList from './pages/courses/CourseList'
import CourseEdit from './pages/courses/CourseEdit'
import QuizList from './pages/quiz/QuizList'
import QuizEdit from './pages/quiz/QuizEdit'
import QuizImport from './pages/quiz/QuizImport'
import KnowledgePoints from './pages/knowledge/KnowledgePoints'
import KnowledgeGraph from './pages/knowledge/KnowledgeGraph'
import Flashcards from './pages/knowledge/Flashcards'
import AchievementList from './pages/achievements/AchievementList'
import FeedbackList from './pages/feedback/FeedbackList'
import AdminList from './pages/settings/AdminList'
import SystemConfig from './pages/settings/SystemConfig'
import MistakeList from './pages/mistakes/MistakeList'
import ModelList from './pages/models/ModelList'
import ModelUpload from './pages/models/ModelUpload'
import ModelEdit from './pages/models/ModelEdit'
import ModelViewer from './pages/models/ModelViewer'

function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, hasRole } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  if (roles && !hasRole(roles)) {
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="users" element={<UserList />} />
        <Route path="users/:id" element={<UserDetail />} />
        <Route path="courses" element={<CourseList />} />
        <Route path="courses/new" element={<ProtectedRoute roles={['superadmin', 'editor']}><CourseEdit /></ProtectedRoute>} />
        <Route path="courses/:id/edit" element={<ProtectedRoute roles={['superadmin', 'editor']}><CourseEdit /></ProtectedRoute>} />
        <Route path="quiz" element={<QuizList />} />
        <Route path="quiz/new" element={<ProtectedRoute roles={['superadmin', 'editor']}><QuizEdit /></ProtectedRoute>} />
        <Route path="quiz/:id/edit" element={<ProtectedRoute roles={['superadmin', 'editor']}><QuizEdit /></ProtectedRoute>} />
        <Route path="quiz/import" element={<ProtectedRoute roles={['superadmin', 'editor']}><QuizImport /></ProtectedRoute>} />
        <Route path="mistakes" element={<ProtectedRoute roles={['superadmin', 'editor', 'viewer']}><MistakeList /></ProtectedRoute>} />
        <Route path="knowledge" element={<Navigate to="/knowledge/points" replace />} />
        <Route path="knowledge/points" element={<KnowledgePoints />} />
        <Route path="knowledge/graph" element={<KnowledgeGraph />} />
        <Route path="knowledge/flashcards" element={<Flashcards />} />
        <Route path="achievements" element={<AchievementList />} />
        <Route path="feedback" element={<FeedbackList />} />
        <Route path="models" element={<ProtectedRoute roles={['superadmin', 'editor']}><ModelList /></ProtectedRoute>} />
        <Route path="models/new" element={<ProtectedRoute roles={['superadmin', 'editor']}><ModelUpload /></ProtectedRoute>} />
        <Route path="models/:id/view" element={<ModelViewer />} />
        <Route path="models/:id/edit" element={<ProtectedRoute roles={['superadmin', 'editor']}><ModelEdit /></ProtectedRoute>} />
        <Route path="settings/admins" element={<ProtectedRoute roles={['superadmin']}><AdminList /></ProtectedRoute>} />
        <Route path="settings/config" element={<ProtectedRoute roles={['superadmin']}><SystemConfig /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
