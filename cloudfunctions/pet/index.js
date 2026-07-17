// 云函数 pet - 猫咪养成（学习搭子"球球"）
// get: 获取猫咪状态（首次访问自动建档）；feed: 喂食（-5小鱼干）；pat: 抚摸（心情+5）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const FEED_COST = 5;       // 喂食消耗小鱼干
const FEED_FULLNESS = 15;  // 喂食恢复饱食
const PAT_MOOD = 5;        // 抚摸恢复心情

// 参数校验：字符串长度不超过10000，数组长度不超过100
function validateParams(obj) {
  for (const key in obj) {
    const val = obj[key];
    if (typeof val === 'string' && val.length > 10000) {
      return { code: 400, msg: '参数 ' + key + ' 过长' };
    }
    if (Array.isArray(val) && val.length > 100) {
      return { code: 400, msg: '参数 ' + key + ' 数量超限' };
    }
  }
  return null;
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

// 应用经验值与升级（xpMax = level * 100）
function applyXp(pet, gain) {
  let { level, xp, xpMax } = pet;
  xp += gain;
  let leveledUp = false;
  while (xp >= xpMax) {
    xp -= xpMax;
    level += 1;
    xpMax = level * 100;
    leveledUp = true;
  }
  return { level, xp, xpMax, leveledUp };
}

// 新用户建档
function defaultPet(openid) {
  const now = Date.now();
  return {
    _openid: openid || '',
    name: '球球',
    level: 1,
    xp: 0,
    xpMax: 100,
    mood: 80,
    fullness: 70,
    intimacy: 1,
    fish: 50,
    todayEarned: 0,
    accompanyDays: 1,
    createdAt: now,
    updatedAt: now
  };
}

// 写成长日记
async function addDiary(openid, time, text) {
  await db.collection('pet_diary').add({
    data: {
      _openid: openid || '',
      time,
      text,
      createdAt: Date.now()
    }
  });
}

// 查询猫咪；无记录且已登录则建档；未登录返回默认 demo 猫咪
async function getOrCreatePet(openid) {
  if (openid) {
    const { data } = await db.collection('pet').where({ _openid: openid }).limit(1).get();
    if (data.length > 0) {
      return { pet: data[0], isDemo: false, docId: data[0]._id };
    }
    // 首次访问：建档
    const doc = defaultPet(openid);
    const { _id } = await db.collection('pet').add({ data: doc });
    await addDiary(openid, '今天', '球球来到了你身边，一起学习一起成长吧！');
    return { pet: { _id, ...doc }, isDemo: false, docId: _id };
  }
  // 未登录：返回默认猫咪（不查库）
  return { pet: defaultPet(''), isDemo: true, docId: null };
}

// 查询成长日记（最近10条）
async function listDiary(openid, isDemo) {
  if (isDemo || !openid) return [];
  const { data } = await db.collection('pet_diary')
    .where({ _openid: openid })
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();
  return data.map((d) => ({ _id: d._id, time: d.time || '', text: d.text }));
}

function formatPet(p) {
  return {
    name: p.name || '球球',
    level: p.level || 1,
    xp: p.xp || 0,
    xpMax: p.xpMax || 100,
    mood: p.mood || 0,
    fullness: p.fullness || 0,
    intimacy: p.intimacy || 1,
    fish: p.fish || 0,
    todayEarned: p.todayEarned || 0,
    accompanyDays: p.accompanyDays || 1
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action = 'get' } = event;

  const validErr = validateParams(event);
  if (validErr) return validErr;

  try {
    const { pet, isDemo, docId } = await getOrCreatePet(OPENID);

    // 喂食 / 抚摸需要真实档案
    if (action !== 'get') {
      if (isDemo || !docId) {
        return { code: 401, msg: '登录后才能和球球互动哦' };
      }

      const now = new Date();
      const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const update = { updatedAt: Date.now() };
      let msg = '';
      let diaryText = '';

      if (action === 'feed') {
        if (pet.fish < FEED_COST) {
          return { code: 400, msg: '小鱼干不足，去学习赚小鱼干吧' };
        }
        const r = applyXp(pet, 5);
        update.fish = pet.fish - FEED_COST;
        update.fullness = clamp(pet.fullness + FEED_FULLNESS, 0, 100);
        update.mood = clamp(pet.mood + 2, 0, 100);
        update.level = r.level;
        update.xp = r.xp;
        update.xpMax = r.xpMax;
        msg = r.leveledUp ? '球球升到 Lv.' + r.level + ' 啦！' : '球球吃得很开心';
        diaryText = '你喂了球球一顿美餐（-' + FEED_COST + ' 小鱼干），饱食度 +' + FEED_FULLNESS + '，球球满足地打了个滚。';
      } else if (action === 'pat') {
        const r = applyXp(pet, 2);
        update.mood = clamp(pet.mood + PAT_MOOD, 0, 100);
        update.level = r.level;
        update.xp = r.xp;
        update.xpMax = r.xpMax;
        // 每抚摸5次亲密度+1
        const patCount = (pet.patCount || 0) + 1;
        update.patCount = patCount;
        if (patCount % 5 === 0) {
          update.intimacy = (pet.intimacy || 1) + 1;
        }
        msg = r.leveledUp ? '球球升到 Lv.' + r.level + ' 啦！' : '球球舒服地眯起了眼';
        diaryText = '你摸了摸球球的头，心情 +' + PAT_MOOD + '，它蹭了蹭你的手。';
      } else {
        return { code: -1, msg: '未知的操作类型' };
      }

      await db.collection('pet').doc(docId).update({ data: update });
      await addDiary(OPENID, time, diaryText);

      const merged = { ...pet, ...update };
      const diary = await listDiary(OPENID, false);
      return { code: 0, data: { pet: formatPet(merged), diary, msg } };
    }

    // get
    const diary = await listDiary(OPENID, isDemo);
    return { code: 0, data: { pet: formatPet(pet), diary, isDemo } };
  } catch (err) {
    console.error('pet error:', err);
    return { code: -1, msg: '猫咪服务异常' };
  }
};
