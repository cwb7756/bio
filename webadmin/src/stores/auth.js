import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../lib/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      login: async (username, password) => {
        const data = await authApi.login({ username, password });
        set({
          token: data.token,
          user: { adminId: data.admin._id, username: data.admin.username, role: data.admin.role },
          isAuthenticated: true,
        });
        return data;
      },
      logout: () => {
        set({ token: null, user: null, isAuthenticated: false });
      },
      hasRole: (roles) => {
        const user = get().user;
        if (!user) return false;
        return roles.includes(user.role);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
      // 清除旧的无效持久化数据（role 为 undefined 的旧版本数据）
      onRehydrateStorage: () => (state) => {
        if (state && state.user && !state.user.role) {
          state.user = null;
          state.token = null;
          state.isAuthenticated = false;
        }
      },
    }
  )
);
