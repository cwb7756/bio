// cloudfunctions/admin/modules/courseModule.js
const { parsePagination } = require('../lib/helpers');
const { requireRole } = require('../lib/middleware');

// course.list: 课程列表
async function listCourses(db, event) {
  const { skip, limit, page, pageSize } = parsePagination(event);
  const { search = '', chapter = '' } = event;

  let query = {};
  if (search) {
    query.title = db.RegExp({ regexp: search, options: 'i' });
  }
  if (chapter) {
    query.chapter = chapter;
  }

  const { total } = await db.collection('courses').where(query).count();
  const { data } = await db.collection('courses')
    .where(query)
    .orderBy('sort', 'asc')
    .skip(skip)
    .limit(limit)
    .get();

  return { code: 0, data: { list: data, total, page, pageSize } };
}

// course.create: 新建课程
async function createCourse(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { title, chapter, tag, level, duration, totalLessons, sort, icon, demoCompleted } = event;
  if (!title) return { code: -1, msg: '课程标题不能为空' };

  const now = Date.now();
  const { _id } = await db.collection('courses').add({
    data: {
      title, chapter: chapter || '', tag: tag || '', level: level || '',
      duration: duration || 0, totalLessons: totalLessons || 0, sort: sort || 0,
      icon: icon || 'ic-microscope', demoCompleted: demoCompleted || 0,
      createdAt: now, updatedAt: now
    }
  });

  return { code: 0, data: { _id } };
}

// course.update: 编辑课程
async function updateCourse(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { courseId, ...updates } = event;
  if (!courseId) return { code: -1, msg: '缺少 courseId' };

  const allowed = ['title', 'chapter', 'tag', 'level', 'duration', 'totalLessons', 'sort', 'icon', 'demoCompleted'];
  const data = {};
  allowed.forEach((k) => {
    if (updates[k] !== undefined) data[k] = updates[k];
  });
  data.updatedAt = Date.now();

  await db.collection('courses').doc(courseId).update({ data });
  return { code: 0, msg: '更新成功' };
}

// course.delete: 删除课程
async function deleteCourse(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { courseId } = event;
  if (!courseId) return { code: -1, msg: '缺少 courseId' };

  await db.collection('courses').doc(courseId).remove();
  return { code: 0, msg: '删除成功' };
}

// lesson.list: 课时列表
async function listLessons(db, event, _admin) {
  const { courseId } = event;
  if (!courseId) return { code: -1, msg: '缺少 courseId' };

  const { data } = await db.collection('lessons')
    .where({ courseId })
    .orderBy('sort', 'asc')
    .get();

  return { code: 0, data: { list: data } };
}

// lesson.create: 新建课时
async function createLesson(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { courseId, title, sort, videoId, content } = event;
  if (!courseId || !title) return { code: -1, msg: 'courseId 和 title 不能为空' };

  const now = Date.now();
  const { _id } = await db.collection('lessons').add({
    data: { courseId, title, sort: sort || 0, videoId: videoId || '', content: content || '', createdAt: now, updatedAt: now }
  });

  return { code: 0, data: { _id } };
}

// lesson.update: 编辑课时
async function updateLesson(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { lessonId, ...updates } = event;
  if (!lessonId) return { code: -1, msg: '缺少 lessonId' };

  const allowed = ['title', 'sort', 'videoId', 'content'];
  const data = {};
  allowed.forEach((k) => {
    if (updates[k] !== undefined) data[k] = updates[k];
  });
  data.updatedAt = Date.now();

  await db.collection('lessons').doc(lessonId).update({ data });
  return { code: 0, msg: '更新成功' };
}

// lesson.delete: 删除课时
async function deleteLesson(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { lessonId } = event;
  if (!lessonId) return { code: -1, msg: '缺少 lessonId' };

  await db.collection('lessons').doc(lessonId).remove();
  return { code: 0, msg: '删除成功' };
}

module.exports = {
  listCourses, createCourse, updateCourse, deleteCourse,
  listLessons, createLesson, updateLesson, deleteLesson
};
