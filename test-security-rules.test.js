// 测试文件 - 用于验证安全规则的准确性
// 这些代码应该触发 ESLint 警告/错误

const cloud = require('wx-server-sdk');
const db = cloud.database();
const _ = db.command;

/**
 * 错误示例 - 以下代码都应该被 ESLint 捕获
 */

// ❌ 错误 1: 从 event 中读取 userID
async function test1(event) {
  const { userID } = event; // 应该报错：no-trust-userid
  return userID;
}

// ❌ 错误 2: 使用 property 访问 event.userID
async function test2(event) {
  const userId = event.userID; // 应该报错：no-trust-userid
  return userId;
}

// ❌ 错误 3: 数据库查询未使用_openid 隔离
async function test3() {
  const { OPENID } = cloud.getWXContext();
  
  const data = await db.collection('users')
    .where({}) // 应该报错：require-openid-isolation (empty where)
    .get();
    
  return data;
}

// ❌ 错误 4: 用户专属数据查询未使用_openid
async function test4() {
  const data = await db.collection('study_progress')
    .where({ courseId: 'course123' }) // 应该报错：require-openid-isolation
    .get();
    
  return data;
}

// ❌ 错误 5: 错误的映射别名
async function test5(event) {
  const uid = event.userId; // 应该报错：no-trust-userid
  return uid;
}

// ❌ 错误 6: 混合查询但仍缺少_openid
async function test6(event) {
  const { userID } = event; // 应该报错
  
  const { data } = await db.collection('mistakes')
    .where(_.or([
      { userID },
      { type: 'lesson' }
    ]))
    .get();
    
  return data;
}

/**
 * 正确示例 - 这些代码不应该触发任何警告
 */

// ✅ 正确 1: 使用 OPENID
async function correct1(event) {
  const { OPENID } = cloud.getWXContext();
  return OPENID;
}

// ✅ 正确 2: 数据库查询使用_openid 隔离
async function correct2() {
  const { OPENID } = cloud.getWXContext();
  
  const data = await db.collection('users')
    .where({ _openid: OPENID })
    .get();
    
  return data;
}

// ✅ 正确 3: 组合查询包含_openid
async function correct3() {
  const { OPENID } = cloud.getWXContext();
  
  const data = await db.collection('study_progress')
    .where(_.and([
      { _openid: OPENID },
      { courseId: 'course123' }
    ]))
    .get();
    
  return data;
}

// ✅ 正确 4: _.or 中的多个条件都包含_openid
async function correct4() {
  const { OPENID } = cloud.getWXContext();
  
  const data = await db.collection('study_progress')
    .where(_.or([
      { _openid: OPENID, type: 'lesson' },
      { _openid: OPENID, type: 'quiz' }
    ]))
    .get();
    
  return data;
}

module.exports = {
  test1, test2, test3, test4, test5, test6,
  correct1, correct2, correct3, correct4
};
