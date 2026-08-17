// cloudfunctions/admin/modules/quizModule.js
const { parsePagination } = require('../lib/helpers');
const { requireRole } = require('../lib/middleware');

// 题目审核状态：AI 生成的题为 pending，审核通过后用户端可见
const QUESTION_STATUS = ['pending', 'approved', 'rejected'];
const DIFFICULTY_ENUM = ['easy', 'medium', 'hard'];

// quiz.list: 题目分页列表（支持 status/jobId/source 筛选，供审核列表与生成结果预览复用）
async function list(db, event, _admin) {
  const _ = db.command;
  const { skip, limit, page, pageSize } = parsePagination(event);
  const { chapter = '', topic = '', search = '', status = '', jobId = '', source = '' } = event;

  let query = {};
  if (chapter) query.chapter = chapter;
  if (topic) query.topic = topic;
  if (status) query.status = status;
  if (jobId) query.jobId = jobId;
  if (source) query.source = source;
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

// quiz.detail: 题目详情（编辑回显用，返回完整题目文档）
async function detail(db, event, _admin) {
  const { questionId } = event;
  if (!questionId) return { code: -1, msg: '缺少 questionId' };

  // 用 where 查询而非 doc().get()：文档不存在时不抛错，可正确返回 404
  const { data } = await db.collection('quiz_questions')
    .where({ _id: questionId })
    .limit(1)
    .get();
  if (data.length === 0) return { code: 404, msg: '题目不存在' };

  return { code: 0, data: data[0] };
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
      difficulty: DIFFICULTY_ENUM.indexOf(event.difficulty) >= 0 ? event.difficulty : 'medium',
      status: 'approved', source: 'manual',
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

  const allowed = ['stem', 'options', 'answer', 'explanation', 'type', 'chapter', 'topic', 'difficulty', 'status'];
  const data = {};
  allowed.forEach((k) => {
    if (updates[k] !== undefined) data[k] = updates[k];
  });
  if (data.status && QUESTION_STATUS.indexOf(data.status) < 0) {
    return { code: -1, msg: '无效的题目状态' };
  }
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

// quiz.batchDelete: 批量删除题目（单次最多 100 条，服务端一次 where+remove 减少数据库调用）
async function batchDelete(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { questionIds } = event;
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return { code: -1, msg: '缺少 questionIds' };
  }
  if (questionIds.length > 100) {
    return { code: -1, msg: '单次最多删除 100 条' };
  }

  const _ = db.command;
  const { stats } = await db.collection('quiz_questions')
    .where({ _id: _.in(questionIds) })
    .remove();

  return { code: 0, data: { removed: stats.removed }, msg: '已删除 ' + stats.removed + ' 条题目' };
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
          difficulty: DIFFICULTY_ENUM.indexOf(q.difficulty) >= 0 ? q.difficulty : 'medium',
          status: 'approved',
          source: 'manual',
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

// quiz.batchReview: 批量审核题目（approve 上线 / reject 拒绝）
async function batchReview(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { questionIds, action } = event;
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return { code: -1, msg: '缺少 questionIds' };
  }
  if (questionIds.length > 100) {
    return { code: -1, msg: '单次最多审核 100 条' };
  }
  if (action !== 'approve' && action !== 'reject') {
    return { code: -1, msg: '无效的审核操作' };
  }

  const _ = db.command;
  const status = action === 'approve' ? 'approved' : 'rejected';
  const now = Date.now();
  const { stats } = await db.collection('quiz_questions')
    .where({ _id: _.in(questionIds) })
    .update({
      data: {
        status: status,
        reviewedBy: admin.username || admin.adminId || '',
        reviewedAt: now,
        updatedAt: now
      }
    });

  const label = action === 'approve' ? '已通过上线' : '已拒绝';
  return { code: 0, data: { updated: stats.updated }, msg: label + ' ' + stats.updated + ' 条题目' };
}

// quiz.backfillStatus: 存量题目状态回填（给无 status 字段的旧题补 approved，幂等，部署后调用一次）
async function backfillStatus(db, _event, admin) {
  const roleErr = requireRole(admin, 'superadmin');
  if (roleErr) return roleErr;

  const _ = db.command;
  let updated = 0;
  let scanned = 0;
  let lastId = '';

  // 按 _id 游标分页扫描，避免 skip 在更新过程中位移
  while (true) {
    const { data } = await db.collection('quiz_questions')
      .where(lastId ? { _id: _.gt(lastId) } : {})
      .orderBy('_id', 'asc')
      .limit(100)
      .get();
    if (data.length === 0) break;

    lastId = data[data.length - 1]._id;
    scanned += data.length;

    const ids = data.filter(function (q) { return !q.status; }).map(function (q) { return q._id; });
    if (ids.length > 0) {
      const now = Date.now();
      const res = await db.collection('quiz_questions')
        .where({ _id: _.in(ids) })
        .update({ data: { status: 'approved', source: 'manual', updatedAt: now } });
      updated += res.stats.updated;
    }

    // 安全上限，防止异常情况下死循环
    if (scanned >= 10000) break;
  }

  return { code: 0, data: { scanned: scanned, updated: updated }, msg: '回填完成，共更新 ' + updated + ' 条' };
}

module.exports = { list, detail, create, update, del, batchDelete, batchImport, batchReview, backfillStatus };
