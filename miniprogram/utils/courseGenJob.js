// utils/courseGenJob.js
// AI课堂课件生成任务全局管理器（单例）
// 生成流程挂在全局对象上：退出/销毁页面后任务继续运行，回到页面可恢复进度或直接播放
const cw = require('./courseware.js');

// ---------- 任务状态 ----------

const state = {
  running: false,      // 生成中
  done: false,         // 生成完成（结果待页面消费）
  failed: false,       // 全部场景生成失败
  question: '',
  title: '',
  genCurrent: 0,       // 正在生成第几节（1-based）
  genTotal: 0,
  genDoneList: [],     // [{ title, sceneType }]
  genProgress: '0%',
  genStage: '',        // 阶段提示（如「正在绘制插图…」）
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
    genCurrent: state.genCurrent,
    genTotal: state.genTotal,
    genDoneList: state.genDoneList,
    genProgress: state.genProgress,
    genStage: state.genStage
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

// LLM 调用：流式累加全文 → 解析 JSON；失败 reject 供重试
function llmJson(messages) {
  return new Promise(function (resolve, reject) {
    const model = wx.cloud.extend.AI.createModel('cloudbase');
    let full = '';
    model.streamText({
      data: { model: 'hy3', messages: messages },
      onText: function (delta) { full += delta; },
      onFinish: function (finalText) {
        full = finalText || full;
        try {
          resolve(cw.extractJson(full));
        } catch (e) {
          reject(e);
        }
      }
    }).catch(reject);
  });
}

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

// 生成单个场景：失败重试 1 次 → 降级 concept 文字页
async function genOneScene(question, coursewareTitle, section, index, total) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await llmJson(cw.buildSceneMessages(question, coursewareTitle, section, index + 1, total));
      const scene = cw.normalizeScene(raw, section.title);
      if (scene) return scene;
    } catch (err) {
      console.error('scene gen error (attempt ' + attempt + '):', err);
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
function start(question, title, sections) {
  if (state.running) return false;
  aborted = false;
  state.running = true;
  state.done = false;
  state.failed = false;
  state.question = question;
  state.title = title;
  state.genCurrent = 1;
  state.genTotal = sections.length;
  state.genDoneList = [];
  state.genProgress = '0%';
  state.genStage = '';
  state.scenesRaw = [];
  notify();
  // 异步执行，不阻塞调用方
  run(question, title, sections);
  return true;
}

async function run(question, title, sections) {
  const imageJobs = [];
  for (let i = 0; i < sections.length; i++) {
    if (aborted) return finish(false);
    state.genCurrent = i + 1;
    notify();
    const scene = await genOneScene(question, title, sections[i], i, sections.length);
    if (aborted) return finish(false);
    state.scenesRaw.push(scene);
    scheduleSceneImages(imageJobs, scene);
    state.genDoneList = state.scenesRaw.map(function (s) {
      return { title: s.title, sceneType: s.type };
    });
    state.genProgress = Math.round(state.scenesRaw.length / sections.length * 100) + '%';
    notify();
  }

  if (!state.scenesRaw.length) {
    return finish(true);
  }

  // 等待全部生图任务完成（帧级并行，fileID 直接写回场景对象）
  if (imageJobs.length) {
    state.genStage = '正在绘制插图…';
    notify();
    await Promise.all(imageJobs);
  }
  if (aborted) return finish(false);

  // 保存课件（best-effort，失败不影响播放）
  wx.cloud.callFunction({
    name: 'aiCourseware',
    data: {
      action: 'saveCourseware',
      title: title,
      question: question,
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
  notify();
}

// 中断任务（保留已生成部分供 consumePartial 取用）
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

// 生成中途取走已完成部分（「先播已完成」）；任务标记中断
function consumePartial() {
  aborted = true;
  const scenes = state.scenesRaw.slice();
  if (!scenes.length) return null;
  const result = { scenesRaw: scenes, title: state.title, question: state.question };
  state.scenesRaw = [];
  state.running = false;
  state.done = false;
  state.failed = false;
  notify();
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
  consumePartial: consumePartial,
  clearFailed: clearFailed
};
