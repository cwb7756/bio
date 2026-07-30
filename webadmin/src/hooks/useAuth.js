import { useAuthStore } from '../stores/auth';

export function useAuth() {
  const { user, isAuthenticated, login, logout, hasRole } = useAuthStore();
  return {
    user,
    isAuthenticated,
    login,
    logout,
    hasRole,
    isSuperAdmin: hasRole(['superadmin']),
    isEditor: hasRole(['superadmin', 'editor']),
    isViewer: hasRole(['superadmin', 'editor', 'viewer']),
  };
}
