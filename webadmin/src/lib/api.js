import axios from 'axios';
import { useAuthStore } from '../stores/auth';

const BASE_URL = import.meta.env.VITE_CLOUD_FUNCTION_URL;

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：从 Zustand store 读取 JWT
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：处理认证错误
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 通用 API 调用方法
export const api = {
  post: async (action, data = {}) => {
    try {
      const res = await apiClient.post('', { action, ...data });
      if (res.data.code !== 0) {
        throw new Error(res.data.msg || '操作失败');
      }
      return res.data.data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },
};

// 认证相关 API
export const authApi = {
  login: (credentials) => api.post('auth.login', credentials),
  changePassword: (data) => api.post('auth.changePwd', data),
  listAdmins: () => api.post('auth.listAdmins'),
  createAdmin: (data) => api.post('auth.createAdmin', data),
  deleteAdmin: (adminId) => api.post('auth.deleteAdmin', { adminId }),
};

// Dashboard API
export const dashboardApi = {
  getStats: () => api.post('dashboard.stats'),
};

// User API
export const userApi = {
  list: (params) => api.post('user.list', params),
  detail: (userId) => api.post('user.detail', { userId }),
  updateStatus: (userId, status) => api.post('user.updateStatus', { userId, status }),
  resetProgress: (userId) => api.post('user.resetProgress', { userId }),
  batchUpdateStatus: (userIds, status) => api.post('user.batchUpdateStatus', { userIds, status }),
};

// Course API
export const courseApi = {
  list: (params) => api.post('course.list', params),
  detail: (courseId) => api.post('course.detail', { courseId }),
  create: (data) => api.post('course.create', data),
  update: (data) => api.post('course.update', data),
  delete: (courseId) => api.post('course.delete', { courseId }),
  lessonList: (courseId) => api.post('lesson.list', { courseId }),
  lessonCreate: (data) => api.post('lesson.create', data),
  lessonUpdate: (data) => api.post('lesson.update', data),
  lessonDelete: ({ courseId, lessonId }) => api.post('lesson.delete', { courseId, lessonId }),
};

// Quiz API
export const quizApi = {
  list: (params) => api.post('quiz.list', params),
  detail: (questionId) => api.post('quiz.detail', { questionId }),
  create: (data) => api.post('quiz.create', data),
  update: (data) => api.post('quiz.update', data),
  delete: (quizId) => api.post('quiz.delete', { quizId }),
  batchDelete: (quizIds) => api.post('quiz.batchDelete', { questionIds: quizIds }),
  batchImport: (questions) => api.post('quiz.batchImport', { questions }),
};

// Mistakes API (admin only)
export const mistakeApi = {
  list: (params) => api.post('mistake.list', params),
  export: (userId) => api.post('mistake.export', { userId }),
  bulkDelete: (mistakeIds) => api.post('mistake.bulkDelete', { mistakeIds }),
};

// Study progress API (admin only)
export const progressApi = {
  list: (params) => api.post('progress.list', params),
  stats: (userId) => api.post('progress.stats', { userId }),
  byCourse: (courseId) => api.post('progress.byCourse', { courseId }),
};

// AI courseware API
export const coursewareApi = {
  list: (params) => api.post('courseware.list', params),
  detail: (coursewareId) => api.post('courseware.detail', { coursewareId }),
  delete: (coursewareId) => api.post('courseware.delete', { coursewareId }),
};

// Knowledge API
export const knowledgeApi = {
  listPoints: () => api.post('knowledge.listPoints'),
  savePoint: (data) => api.post('knowledge.savePoint', data),
  deletePoint: (pointId) => api.post('knowledge.deletePoint', { pointId }),
  listGraph: () => api.post('knowledge.listGraph'),
  saveGraph: (data) => api.post('knowledge.saveGraph', data),
  deleteGraph: (id) => api.post('knowledge.deleteGraph', { id }),
  flashcardList: () => api.post('flashcard.list'),
  saveFlashcard: (data) => api.post('flashcard.save', data),
  deleteFlashcard: (cardId) => api.post('flashcard.delete', { cardId }),
};

// Achievement API
export const achievementApi = {
  list: () => api.post('achievement.list'),
  save: (data) => api.post('achievement.save', data),
  delete: (achievementId) => api.post('achievement.delete', { achievementId }),
  grantList: () => api.post('achievement.grantList'),
};

// Feedback API
export const feedbackApi = {
  list: (params) => api.post('feedback.list', params),
  reply: (feedbackId, content) => api.post('feedback.reply', { feedbackId, content }),
  updateStatus: (feedbackId, status) => api.post('feedback.updateStatus', { feedbackId, status }),
};

// Settings API
export const settingsApi = {
  get: () => api.post('settings.get'),
  update: (data) => api.post('settings.update', data),
};
