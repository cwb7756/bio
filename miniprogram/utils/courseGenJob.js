// utils/courseGenJob.js
// AI课堂课件生成任务全局管理器（单例）
// 生成流程挂在全局对象上：退出/销毁页面后任务继续运行，回到页面可恢复进度或直接播放
// 场景生成采用 CONCURRENCY 个 LLM 并发 + 索引认领补位制：工人完成即认领下一节，
// 结果按索引落位保证顺序；限流退避时其余工人继续补位
const cw = require('./courseware.js');

// LLM 并发工人数
const CONCURRENCY = 3;

// ---------- 任务状态 ----------

const state = {
  running: false,      // 生成中
  done: false,         // 生成完成（结果待页面消费）
  failed: false,       // 全部场景生成失败
  question: '',
  title: '',
  voice: 101001,       // 课件音色（随课件保存到历史记录）
  genTotal: 0,
  genDoneList: [],     // [{ title, sceneType }]（按大纲索引顺序）
  genProgress: '0%',
  genStage: '',        // 阶段提示（如「正在绘制插图…」）
  sections: [],       // 大纲快照（生成页章节清单展示）
  genStatuses: [],     // 每节状态 ['pending'|'doing'|'done']，按大纲索引
  scenesRaw: []        // 已生成的场景（含生图 fileID 写回）
};

let aborted = false;
const listeners = [];

function getState() {
  return {
    running: state.running,
    done: state.done,
    failed: state.failed,
    question: state.question,
    title: state.title,
    genTotal: state.genTotal,
    genDoneList: state.genDoneList,
    genProgress: state.genProgress,
    genStage: state.genStage,
    sections: state.sections,
    genStatuses: state.genStatuses
  };
}

function notify() {
  const snapshot = getState();
  listeners.slice().forEach(function (fn) {
    try { fn(snapshot); } catch (e) {
      // 订阅页面异常不影响任务执行
    }
  });
}

function subscribe(fn) {
  if (listeners.indexOf(fn) < 0) listeners.push(fn);
}

function unsubscribe(fn) {
  const i = listeners.indexOf(fn);
  if (i >= 0) listeners.splice(i, 1);
}

// ---------- LLM / 生图调用 ----------

// LLM 调用统一走 cw.llmJson（内置限流感知退避重试与全局节流）

// 调云函数文生图；失败返回 ''（不 throw，走降级）
function genImage(visual) {
  if (!visual) return Promise.resolve('');
  return wx.cloud.callFunction({
    name: 'aiCourseware',
    data: { action: 'genImage', visual: visual }
  }).then(function (res) {
    if (res.result && res.result.code === 0 && res.result.fileID) {
      return res.result.fileID;
    }
    return '';
  }).catch(function (err) {
    console.error('genImage error:', err);
    return '';
  });
}

// 生成单个场景：失败重试 1 次（普通错误等 3s，限流错误等 15s）→ 降级 concept 文字页
async function genOneScene(question, coursewareTitle, section, index, total) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await cw.llmJson(cw.buildSceneMessages(question, coursewareTitle, section, index + 1, total));
      const scene = cw.normalizeScene(raw, section.title);
      if (scene) return scene;
    } catch (err) {
      console.error('scene gen error (attempt ' + attempt + '):', err);
      // 失败后稍作等待再重试；限流时等待更久以跨过限流窗口
      if (attempt === 0) {
        const waitMs = cw.isRateLimitError(err) ? 15000 : 3000;
        await new Promise(function (r) { setTimeout(r, waitMs); });
      }
    }
  }
  return cw.fallbackScene(section.title, section.goal);
}

// 收集场景生图任务：diagram 单张；sim 帧级并行，fileID 写回场景对象
function scheduleSceneImages(imageJobs, scene) {
  if (scene.type === 'diagram' && scene.visual) {
    imageJobs.push(genImage(scene.visual).then(function (fileID) {
      scene.imageFileId = fileID;
    }));
  } else if (scene.type === 'sim' && Array.isArray(scene.frames)) {
    scene.frames.forEach(function (f) {
      if (f.visual) {
        imageJobs.push(genImage(f.visual).then(function (fileID) {
          f.imageFileId = fileID;
        }));
      }
    });
  }
}

// ---------- 任务控制 ----------

// 启动生成任务；已有任务运行中返回 false
function start(question, title, sections, voice) {
  if (state.running) return false;
  aborted = false;
  state.running = true;
  state.done = false;
  state.failed = false;
  state.question = question;
  state.title = title;
  state.voice = typeof voice === 'number' ? voice : 101001;
  state.genTotal = sections.length;
  state.genDoneList = [];
  state.genProgress = '0%';
  state.genStage = '';
  state.sections = sections.map(function (s) {
    return { title: s.title, sceneType: s.sceneType };
  });
  state.genStatuses = sections.map(function () { return 'pending'; });
  state.scenesRaw = [];
  notify();
  // 异步执行，不阻塞调用方
  run(question, title, sections);
  return true;
}

async function run(question, title, sections) {
  const imageJobs = [];
  const total = sections.length;
  const results = new Array(total).fill(null);
  let nextIndex = 0;

  // 按索引重算已完成场景（filter 保留大纲顺序）
  function refreshDoneState() {
    state.scenesRaw = results.filter(Boolean);
    state.genDoneList = state.scenesRaw.map(function (s) {
      return { title: s.title, sceneType: s.type };
    });
    state.genProgress = total > 0 ? Math.round(state.scenesRaw.length / total * 100) + '%' : '0%';
  }

  // 工人：认领下一个未生成索引，完成后继续认领（补位）；中止时退出
  async function worker() {
    while (!aborted) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= total) return;
      state.genStatuses[i] = 'doing';
      notify();
      const scene = await genOneScene(question, title, sections[i], i, total);
      if (aborted) return;
      results[i] = scene;
      state.genStatuses[i] = 'done';
      refreshDoneState();
      notify();
    }
  }

  // 并发启动 min(CONCURRENCY, total) 个工人
  const workers = [];
  const workerCount = Math.min(CONCURRENCY, total);
  for (let w = 0; w < workerCount; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  if (aborted) return finish(false);
  if (!state.scenesRaw.length) {
    return finish(true);
  }

  // 收集场景生图任务（并行），fileID 直接写回场景对象
  state.scenesRaw.forEach(function (scene) {
    scheduleSceneImages(imageJobs, scene);
  });

  // 等待全部生图任务完成
  if (imageJobs.length) {
    state.genStage = '正在绘制插图…';
    notify();
    await Promise.all(imageJobs);
  }
  if (aborted) return finish(false);

  // 保存课件（best-effort，失败不影响播放）；voiceType 随课件保存供历史回放使用
  wx.cloud.callFunction({
    name: 'aiCourseware',
    data: {
      action: 'saveCourseware',
      title: title,
      question: question,
      voiceType: state.voice,
      scenes: state.scenesRaw
    }
  }).catch(function (err) {
    console.error('saveCourseware error:', err);
  });

  finish(false, true);
}

function finish(failed, done) {
  state.running = false;
  state.failed = !!failed;
  state.done = !!done;
  state.genStage = '';
  state.genStatuses = [];
  notify();
}

// 中断任务
function abort() {
  aborted = true;
}

// 页面取走完成结果（进入播放）；取走后任务复位
function consumeResult() {
  if (!state.done) return null;
  const result = { scenesRaw: state.scenesRaw, title: state.title, question: state.question };
  state.done = false;
  state.scenesRaw = [];
  return result;
}

// 失败状态复位（页面提示后调用）
function clearFailed() {
  state.failed = false;
}

module.exports = {
  start: start,
  abort: abort,
  getState: getState,
  subscribe: subscribe,
  unsubscribe: unsubscribe,
  consumeResult: consumeResult,
  clearFailed: clearFailed
};
