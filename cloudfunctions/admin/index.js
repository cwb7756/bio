// cloudfunctions/admin/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// Import modules
const authModule = require('./modules/authModule');
const dashboardModule = require('./modules/dashboardModule');
const userModule = require('./modules/userModule');
const courseModule = require('./modules/courseModule');
const quizModule = require('./modules/quizModule');
const knowledgeModule = require('./modules/knowledgeModule');
const achievementModule = require('./modules/achievementModule');
const feedbackModule = require('./modules/feedbackModule');
const settingsModule = require('./modules/settingsModule');
const modelModule = require('./modules/modelModule');
const mistakesModule = require('./modules/mistakesModule');

// Import middlewares
const { authMiddleware } = require('./lib/middleware');
const { validateParams } = require('./lib/helpers');

// Action -> handler router
const ROUTES = {
  // Auth modules
  'auth.login': authModule.login,
  'auth.init': authModule.init,
  'auth.changePwd': authModule.changePwd,
  'auth.listAdmins': authModule.listAdmins,
  'auth.createAdmin': authModule.createAdmin,
  'auth.deleteAdmin': authModule.deleteAdmin,
  
  // Dashboard module
  'dashboard.stats': dashboardModule.stats,
  
  // User management
  'user.list': userModule.list,
  'user.detail': userModule.detail,
  'user.updateStatus': userModule.updateStatus,
  'user.batchUpdateStatus': userModule.batchUpdateStatus,
  'user.resetProgress': userModule.resetProgress,
  
  // Course management
  'course.list': courseModule.listCourses,
  'course.detail': courseModule.detailCourse,
  'course.create': courseModule.createCourse,
  'course.update': courseModule.updateCourse,
  'course.delete': courseModule.deleteCourse,
  'lesson.list': courseModule.listLessons,
  'lesson.create': courseModule.createLesson,
  'lesson.update': courseModule.updateLesson,
  'lesson.delete': courseModule.deleteLesson,
  
  // Quiz management
  'quiz.list': quizModule.list,
  'quiz.detail': quizModule.detail,
  'quiz.create': quizModule.create,
  'quiz.update': quizModule.update,
  'quiz.delete': quizModule.del,
  'quiz.batchDelete': quizModule.batchDelete,
  'quiz.batchImport': quizModule.batchImport,
  
  // Knowledge management
  'knowledge.listPoints': knowledgeModule.listPoints,
  'knowledge.savePoint': knowledgeModule.savePoint,
  'knowledge.deletePoint': knowledgeModule.deletePoint,
  'knowledge.listGraph': knowledgeModule.listGraph,
  'knowledge.saveGraph': knowledgeModule.saveGraph,
  'knowledge.deleteGraph': knowledgeModule.deleteGraph,
  'flashcard.list': knowledgeModule.listFlashcards,
  'flashcard.save': knowledgeModule.saveFlashcard,
  'flashcard.delete': knowledgeModule.deleteFlashcard,
  
  // Achievement management
  'achievement.list': achievementModule.list,
  'achievement.save': achievementModule.save,
  'achievement.delete': achievementModule.del,
  'achievement.grantList': achievementModule.grantList,
  
  // Feedback management
  'feedback.list': feedbackModule.list,
  'feedback.reply': feedbackModule.reply,
  'feedback.updateStatus': feedbackModule.updateStatus,
  
  // Settings
  'settings.get': settingsModule.get,
  'settings.update': settingsModule.update,
  
  // Model management
  'model.list': modelModule.list,
  'model.detail': modelModule.detail,
  'model.create': modelModule.create,
  'model.uploadFile': modelModule.uploadFile,
  'model.update': modelModule.update,
  'model.delete': modelModule.delete,
  'model.download': modelModule.download,
  
  // Mistake management
  'mistakes.list': mistakesModule.list,
  'mistakes.export': mistakesModule.export,
  'mistakes.bulkDelete': mistakesModule.bulkDelete
};

// Main entry point
exports.main = async (event) => {
  // 兼容网关 HTTP 访问：如果 body 是字符串则解析合并到 event
  if (event.body && typeof event.body === 'string') {
    try {
      const parsed = JSON.parse(event.body);
      event = Object.assign({}, parsed, event);
    } catch (e) {
      // body 不是合法 JSON，忽略
    }
  }

  const { action } = event;
  
  if (!action) return { code: 400, msg: '缺少 action 参数' };
  
  // Validate params
  // 注：model.uploadFile 传输 base64 文件内容，长度必然超过 10000 字符通用上限，
  // 跳过通用校验，文件大小由 modelModule.uploadFile 内部 MAX_BASE64_SIZE 限制。
  if (action !== 'model.uploadFile') {
    const validErr = validateParams(event);
    if (validErr) return validErr;
  }
  
  // JWT auth
  const authResult = authMiddleware(event);
  if (!authResult.ok) return authResult.error;
  const admin = authResult.admin; // Admin info passed to handlers
  
  // Route to handler
  const handler = ROUTES[action];
  if (!handler) return { code: -1, msg: '未知的操作类型：' + action };
  
  // Execute business logic
  try {
    return await handler(db, event, admin);
  } catch (err) {
    console.error('admin error [' + action + ']:', err);
    const msg = String(err && (err.errMsg || err.message) || '');
    if (msg.includes('duplicate key')) {
      return { code: -1, msg: '数据冲突，请重试' };
    }
    return { code: -1, msg: '服务器异常：' + (err.message || '未知错误') };
  }
};
