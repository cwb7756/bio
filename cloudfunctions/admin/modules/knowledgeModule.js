// cloudfunctions/admin/modules/knowledgeModule.js
const { parsePagination } = require('../lib/helpers');
const { requireRole } = require('../lib/middleware');

// --- 知识点 ---

// knowledge.listPoints: 知识点列表
async function listPoints(db, event, _admin) {
  const { skip, limit, page, pageSize } = parsePagination(event);
  const { search = '', chapter = '' } = event;

  let query = {};
  if (chapter) query.chapter = chapter;
  if (search) {
    const _ = db.command;
    query = _.or([
      { title: db.RegExp({ regexp: search, options: 'i' }) },
      { desc: db.RegExp({ regexp: search, options: 'i' }) }
    ]);
  }

  const { total } = await db.collection('knowledge_points').where(query).count();
  const { data } = await db.collection('knowledge_points')
    .where(query)
    .skip(skip)
    .limit(limit)
    .get();

  return { code: 0, data: { list: data, total, page, pageSize } };
}

// knowledge.savePoint: 新建/编辑知识点
async function savePoint(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { pointId, title, desc, chapter, sort } = event;
  if (!title) return { code: -1, msg: '标题不能为空' };

  const now = Date.now();
  // 字段对齐 knowledge_points 集合：title/desc/chapter/icon/sort
  const data = { title, desc: desc || '', chapter: chapter || '', updatedAt: now };
  if (sort !== undefined) data.sort = Number(sort) || 0;

  if (pointId) {
    await db.collection('knowledge_points').doc(pointId).update({ data });
    return { code: 0, msg: '更新成功' };
  }

  data.createdAt = now;
  data.icon = 'ic-target';
  data.sort = data.sort || 0;
  const { _id } = await db.collection('knowledge_points').add({ data });
  return { code: 0, data: { _id } };
}

// knowledge.deletePoint: 删除知识点
async function deletePoint(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { pointId } = event;
  if (!pointId) return { code: -1, msg: '缺少 pointId' };

  await db.collection('knowledge_points').doc(pointId).remove();
  return { code: 0, msg: '删除成功' };
}

// --- 知识图谱 ---

// knowledge.listGraph: 图谱节点和边列表
async function listGraph(db, event, _admin) {
  const { courseId } = event;

  let query = {};
  if (courseId) query.courseId = courseId;

  const [nodesRes, edgesRes] = await Promise.all([
    db.collection('knowledge_graph_nodes').where(query).limit(500).get(),
    db.collection('knowledge_graph_edges').where(query).limit(500).get()
  ]);

  return { code: 0, data: { nodes: nodesRes.data, edges: edgesRes.data } };
}

// knowledge.saveGraph: 新建/编辑节点或边
async function saveGraph(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { type, id, relation, ...data } = event;
  // type: 'node' | 'edge'
  if (type !== 'node' && type !== 'edge') {
    return { code: -1, msg: 'type 必须为 node 或 edge' };
  }

  const collection = type === 'node' ? 'knowledge_graph_nodes' : 'knowledge_graph_edges';
  const now = Date.now();
  data.updatedAt = now;
  // 边的关系类型由前端用 relation 传递，存入时映射回 type 字段（contains/prerequisite）
  if (type === 'edge' && relation) data.type = relation;

  if (id) {
    await db.collection(collection).doc(id).update({ data });
    return { code: 0, msg: '更新成功' };
  }

  data.createdAt = now;
  const { _id } = await db.collection(collection).add({ data });
  return { code: 0, data: { _id } };
}

// knowledge.deleteGraph: 删除节点或边
async function deleteGraph(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { type, id } = event;
  if (type !== 'node' && type !== 'edge') {
    return { code: -1, msg: 'type 必须为 node 或 edge' };
  }
  if (!id) return { code: -1, msg: '缺少 id' };

  const collection = type === 'node' ? 'knowledge_graph_nodes' : 'knowledge_graph_edges';
  await db.collection(collection).doc(id).remove();
  return { code: 0, msg: '删除成功' };
}

// --- 闪光卡 ---

// flashcard.list: 闪光卡列表
async function listFlashcards(db, event, admin) {
  const { skip, limit, page, pageSize } = parsePagination(event);
  const { scope = '', chapter = '' } = event;

  let query = {};
  if (scope) query.scope = scope;
  if (chapter) query.chapter = chapter;

  const { total } = await db.collection('flashcards').where(query).count();
  const { data } = await db.collection('flashcards')
    .where(query)
    .skip(skip)
    .limit(limit)
    .get();

  return { code: 0, data: { list: data, total, page, pageSize } };
}

// flashcard.save: 新建/编辑闪光卡
async function saveFlashcard(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { flashcardId, title, content, chapter, scope } = event;
  if (!title) return { code: -1, msg: '标题不能为空' };
  if (!content) return { code: -1, msg: '内容不能为空' };

  const now = Date.now();
  // 字段对齐 flashcards 集合：title/content/chapter/scope/icon/sort
  const data = { title, content, chapter: chapter || '', scope: scope || 'system', updatedAt: now };

  if (flashcardId) {
    await db.collection('flashcards').doc(flashcardId).update({ data });
    return { code: 0, msg: '更新成功' };
  }

  data.createdAt = now;
  data.icon = 'ic-folder';
  data.sort = 0;
  const { _id } = await db.collection('flashcards').add({ data });
  return { code: 0, data: { _id } };
}

// flashcard.delete: 删除闪光卡
async function deleteFlashcard(db, event, admin) {
  const roleErr = requireRole(admin, 'editor');
  if (roleErr) return roleErr;

  const { flashcardId } = event;
  if (!flashcardId) return { code: -1, msg: '缺少 flashcardId' };

  await db.collection('flashcards').doc(flashcardId).remove();
  return { code: 0, msg: '删除成功' };
}

module.exports = {
  listPoints, savePoint, deletePoint,
  listGraph, saveGraph, deleteGraph,
  listFlashcards, saveFlashcard, deleteFlashcard
};
