// cloudfunctions/admin/modules/quizModule.js
const { parsePagination } = require('../lib/helpers');
const { requireRole } = require('../lib/middleware');

// quiz.list: 题目分页列表
async function list(db, event, admin) {
  const _ = db.command;
  const { skip, limit, page, pageSize } = parsePagination(event);
  const { chapter = '', topic = '', search = '' } = event;

  let query = {};
  if (chapter) query.chapter = chapter;
  if (topic) query.topic = topic;
  if (search) {
    query.stem = db.RegExp({ regexp: search, options: 'i' });
  }

  const { total } = await db.collection('quiz_questions').where(query).count();
  const { data } = await db.collection('quiz_questions')
    .where(query)
    .orderBy('_id', 'desc')
    .skip(skip)
    .limit(limit)
    .get();

  return { code: 0, data: { list: data, total, page, pageSize } };
}

// quiz.create: 新建题目
async function create(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { stem, options, answer, explanation, type, chapter, topic } = event;
  if (!stem) return { code: -1, msg: '题干不能为空' };
  if (!options || !Array.isArray(options) || options.length === 0) {
    return { code: -1, msg: '选项不能为空' };
  }
  if (!answer) return { code: -1, msg: '答案不能为空' };

  const now = Date.now();
  const { _id } = await db.collection('quiz_questions').add({
    data: {
      stem, options, answer, explanation: explanation || '',
      type: type || '选择题', chapter: chapter || '', topic: topic || '',
      createdAt: now, updatedAt: now
    }
  });

  return { code: 0, data: { _id } };
}

// quiz.update: 编辑题目
async function update(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { questionId, ...updates } = event;
  if (!questionId) return { code: -1, msg: '缺少 questionId' };

  const allowed = ['stem', 'options', 'answer', 'explanation', 'type', 'chapter', 'topic'];
  const data = {};
  allowed.forEach((k) => {
    if (updates[k] !== undefined) data[k] = updates[k];
  });
  data.updatedAt = Date.now();

  await db.collection('quiz_questions').doc(questionId).update({ data });
  return { code: 0, msg: '更新成功' };
}

// quiz.delete: 删除题目
async function del(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { questionId } = event;
  if (!questionId) return { code: -1, msg: '缺少 questionId' };

  await db.collection('quiz_questions').doc(questionId).remove();
  return { code: 0, msg: '删除成功' };
}

// quiz.batchImport: 批量导入
async function batchImport(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { questions } = event;
  if (!Array.isArray(questions) || questions.length === 0) {
    return { code: -1, msg: '题目数据不能为空' };
  }

  const now = Date.now();
  let added = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < questions.length && i < 100; i++) {
    const q = questions[i];
    if (!q.stem || !q.options || !q.answer) {
      failed++;
      errors.push('第 ' + (i + 1) + ' 条数据不完整');
      continue;
    }
    try {
      await db.collection('quiz_questions').add({
        data: {
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation || '',
          type: q.type || '选择题',
          chapter: q.chapter || '',
          topic: q.topic || '',
          createdAt: now,
          updatedAt: now
        }
      });
      added++;
    } catch (err) {
      failed++;
      errors.push('第 ' + (i + 1) + ' 条导入失败：' + (err.message || ''));
    }
  }

  return { code: 0, data: { added, failed, errors } };
}

module.exports = { list, create, update, del, batchImport };
