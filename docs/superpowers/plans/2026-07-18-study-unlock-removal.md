# 学习系统升级：移除解锁限制 + 学习页猫咪装饰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除章节与知识地图的前置解锁限制（任意章节/节点可直接学习），并在学习页学习概览卡片右上角叠放随机趴姿猫咪图。

**Architecture:** 两级锁分别位于 getCourseList 云函数（章节 color='lock'）与 knowledgeMap 云函数（节点 status='lock'/'current'），前端 study/map 页各自拦截并渲染锁样式。改造为：云函数只按真实 study_progress 记录输出 done/进行中状态；前端移除拦截与锁样式；学习概览卡片新增随机猫咪装饰图。

**Tech Stack:** 微信小程序（WXML/WXSS/JS）、微信云开发云函数（Node.js + wx-server-sdk）、cloudbase MCP 部署。

**Spec:** `docs/superpowers/specs/2026-07-18-study-unlock-removal-design.md`（已确认）

**注意：** 本项目无测试框架（微信开发者工具驱动的无脚本化工程），验证方式为 `node --check` 语法检查 + 云函数上传 + 开发者工具人工走查。不执行 git commit（用户未要求）。

---

### Task 1: getCourseList 云函数 — 删除章节锁逻辑

**Files:**
- Modify: `cloudfunctions/getCourseList/index.js:114-126`

- [ ] **Step 1: 替换锁逻辑块为两态 color 赋值**

将第 114-126 行：

```js
    // 锁逻辑：前一章节未完成（progress < 100）则后续锁定
    chapters.forEach((ch, i) => {
      if (i === 0) {
        ch.color = ch.progress === 100 ? 'done' : 'green';
      } else {
        const prevDone = chapters[i - 1].progress === 100;
        if (!prevDone) {
          ch.color = 'lock';
        } else {
          ch.color = ch.progress === 100 ? 'done' : 'green';
        }
      }
    });
```

替换为：

```js
    // 无解锁限制：章节状态仅区分已完成/进行中
    chapters.forEach((ch) => {
      ch.color = ch.progress === 100 ? 'done' : 'green';
    });
```

- [ ] **Step 2: 语法检查**

Run: `node --check cloudfunctions/getCourseList/index.js`
Expected: 无输出（退出码 0）

---

### Task 2: knowledgeMap 云函数 — done/todo 两态

**Files:**
- Modify: `cloudfunctions/knowledgeMap/index.js:57-93`

- [ ] **Step 1: 重写节点组装与返回值**

将第 57-77 行：

```js
    // 4. 组装节点（真实数据：已完成课时 mastery=100，下一个未完成为当前关卡，其余锁定）
    let currentAssigned = false;
    const nodes = lessons.map((l, i) => {
      const done = completedIndexes.includes(l.index || i + 1) || completedIndexes.includes(i);
      if (done) {
        return { lessonId: l._id, courseId: courseId, index: l.index || i + 1, title: l.title, mastery: 100, status: 'done' };
      }
      if (!currentAssigned) {
        currentAssigned = true;
        return { lessonId: l._id, courseId: courseId, index: l.index || i + 1, title: l.title, mastery: 0, status: 'current' };
      }
      return { lessonId: l._id, courseId: courseId, index: l.index || i + 1, title: l.title, mastery: 0, status: 'lock' };
    });

    // 5. 总览
    const doneCount = nodes.filter((n) => n.status === 'done').length;
    const totalCount = nodes.length;
    const overallPercent = totalCount > 0
      ? Math.round(nodes.reduce((s, n) => s + n.mastery, 0) / totalCount)
      : 0;
    const currentNode = nodes.find((n) => n.status === 'current') || nodes.find((n) => n.status === 'learning') || null;
```

替换为：

```js
    // 4. 组装节点（无解锁限制：已学 done / 未学 todo，看了哪些就点亮哪些）
    const nodes = lessons.map((l, i) => {
      const done = completedIndexes.includes(l.index || i + 1) || completedIndexes.includes(i);
      if (done) {
        return { lessonId: l._id, courseId: courseId, index: l.index || i + 1, title: l.title, mastery: 100, status: 'done' };
      }
      return { lessonId: l._id, courseId: courseId, index: l.index || i + 1, title: l.title, mastery: 0, status: 'todo' };
    });

    // 5. 总览
    const doneCount = nodes.filter((n) => n.status === 'done').length;
    const totalCount = nodes.length;
    const overallPercent = totalCount > 0
      ? Math.round(nodes.reduce((s, n) => s + n.mastery, 0) / totalCount)
      : 0;
```

并将返回值（第 79-95 行）中的 `currentLessonTitle: currentNode ? currentNode.title : ''` 整行删除，即返回：

```js
    return {
      code: 0,
      data: {
        isDemo: false,
        course: {
          _id: course._id,
          title: course.title,
          chapter: course.chapter,
          tag: course.tag || ''
        },
        nodes,
        doneCount,
        totalCount,
        overallPercent
      }
    };
```

- [ ] **Step 2: 语法检查**

Run: `node --check cloudfunctions/knowledgeMap/index.js`
Expected: 无输出（退出码 0）

---

### Task 3: study.js — 去拦截 + 随机猫咪

**Files:**
- Modify: `miniprogram/pages/study/study.js`

- [ ] **Step 1: data 新增 catImage**

在 data 中 `needLogin: false` 后追加一行：

```js
    needLogin: false,
    // 学习概览卡片猫咪装饰图（每次进入随机一张趴姿猫）
    catImage: ''
```

- [ ] **Step 2: onShow 中随机选猫**

在 onShow 的 `this.loadCourseList();` 之前插入：

```js
    // 每次进入随机一张趴姿猫咪（cat-lying-1~5）
    const catIdx = Math.floor(Math.random() * 5) + 1;
    this.setData({ catImage: '/images/cat-lying-' + catIdx + '.png' });
```

- [ ] **Step 3: goChapter 删除 lock 拦截**

将：

```js
  goChapter(e) {
    const idx = e.currentTarget.dataset.index;
    const ch = this.data.chapters[idx];
    if (ch.color === 'lock') {
      wx.showToast({ title: '请先完成前置章节', icon: 'none' });
    } else {
      wx.navigateTo({
        url: '/pages/course/course?courseId=' + ch._id
      });
    }
  },
```

替换为：

```js
  goChapter(e) {
    const idx = e.currentTarget.dataset.index;
    const ch = this.data.chapters[idx];
    wx.navigateTo({
      url: '/pages/course/course?courseId=' + ch._id
    });
  },
```

- [ ] **Step 4: 语法检查**

Run: `node --check miniprogram/pages/study/study.js`
Expected: 无输出（退出码 0）

---

### Task 4: study.wxml — 去锁徽章 + 猫咪图节点

**Files:**
- Modify: `miniprogram/pages/study/study.wxml`

- [ ] **Step 1: 学习概览卡片内加猫咪图**

将：

```xml
      <!-- 学习概览 -->
      <view class="study-overview">
        <view class="overview-item">
```

替换为：

```xml
      <!-- 学习概览 -->
      <view class="study-overview">
        <image class="overview-cat" src="{{catImage}}" mode="aspectFit"></image>
        <view class="overview-item">
```

- [ ] **Step 2: 删除章节卡锁徽章节点**

删除第 83-85 行：

```xml
            <view class="ch-badge ch-badge-lock" wx:if="{{item.color === 'lock'}}">
              <view class="icon ic-lock-white"></view>
            </view>
```

---

### Task 5: study.wxss — 清理 ch-lock + 猫咪趴框样式

**Files:**
- Modify: `miniprogram/pages/study/study.wxss`

- [ ] **Step 1: study-overview 改为相对定位并预留猫咪空间**

将：

```css
.study-overview {
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: linear-gradient(140deg, var(--green-soft2), var(--green-soft));
  border: 4rpx solid var(--line);
  border-radius: 40rpx;
  box-shadow: var(--sh);
  padding: 32rpx 20rpx;
  margin-bottom: 8rpx;
}
```

替换为：

```css
.study-overview {
  position: relative;
  overflow: visible;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: linear-gradient(140deg, var(--green-soft2), var(--green-soft));
  border: 4rpx solid var(--line);
  border-radius: 40rpx;
  box-shadow: var(--sh);
  padding: 32rpx 20rpx;
  margin-top: 110rpx;
  margin-bottom: 8rpx;
}

/* 趴在卡片上框的猫咪装饰（不响应点击，随卡片阴影层次） */
.overview-cat {
  position: absolute;
  top: -108rpx;
  right: 24rpx;
  width: 180rpx;
  height: 130rpx;
  pointer-events: none;
  z-index: 2;
}
```

- [ ] **Step 2: 删除 ch-lock 样式**

删除：

```css
.ch-lock .ch-icon-wrap {
  background: var(--gray-line);
}
```

以及：

```css
.ch-badge-lock {
  background: var(--gray);
}
```

以及：

```css
.ch-lock .ch-progress-fill {
  background: var(--gray);
}
```

---

### Task 6: map.js — 去拦截，移除 startCurrent

**Files:**
- Modify: `miniprogram/pages/map/map.js`

- [ ] **Step 1: data 移除 currentLessonTitle**

将 data 中：

```js
    overallPercent: 0,
    currentLessonTitle: '',
```

改为：

```js
    overallPercent: 0,
```

- [ ] **Step 2: loadMap 移除 currentLessonTitle 赋值**

删除 setData 中的 `currentLessonTitle: d.currentLessonTitle,` 一行。

- [ ] **Step 3: tapNode 去拦截 + 删除 startCurrent**

将第 80-98 行：

```js
  // 点击节点
  tapNode(e) {
    const node = e.currentTarget.dataset.node;
    if (node.status === 'locked' || node.status === 'lock') {
      wx.showToast({ title: '先完成前面的关卡吧', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/course/course?courseId=' + node.courseId });
  },

  // 开始当前关卡 → 跳课程页
  startCurrent() {
    const node = this.data.nodes.find((n) => n.status === 'current');
    if (node) {
      wx.navigateTo({ url: '/pages/course/course?courseId=' + node.courseId });
    } else {
      wx.showToast({ title: '暂无进行中的关卡', icon: 'none' });
    }
  }
```

替换为：

```js
  // 点击节点：无解锁限制，任何节点均可跳转课程页
  tapNode(e) {
    const node = e.currentTarget.dataset.node;
    wx.navigateTo({ url: '/pages/course/course?courseId=' + node.courseId });
  }
```

- [ ] **Step 4: 语法检查**

Run: `node --check miniprogram/pages/map/map.js`
Expected: 无输出（退出码 0）

---

### Task 7: map.wxml — 平铺节点，移除 current/action-bar

**Files:**
- Modify: `miniprogram/pages/map/map.wxml`

- [ ] **Step 1: 节点渲染平铺化**

将第 51-63 行：

```xml
            <view class="node-circle node-{{item.status}} {{item.status === 'current' ? 'node-current-ring' : ''}}">
              <view class="icon ic-check-white node-check" wx:if="{{item.status === 'done'}}"></view>
              <view class="icon ic-lock node-lock" wx:elif="{{item.status === 'lock'}}"></view>
              <text class="node-mastery-in" wx:else>{{item.mastery}}%</text>
            </view>
            <view class="node-label">
              <text class="node-title {{item.status === 'lock' ? 'node-title-lock' : ''}}">{{item.title}}</text>
              <text class="node-sub {{item.status === 'current' ? 'node-sub-current' : ''}}" wx:if="{{item.status !== 'lock'}}">
                {{item.status === 'done' ? '已掌握' : item.status === 'current' ? '掌握度 ' + item.mastery + '% · 闯关中' : '掌握度 ' + item.mastery + '%'}}
              </text>
              <text class="node-sub" wx:else>未解锁</text>
            </view>
            <view class="node-tag" wx:if="{{item.status === 'current'}}">当前</view>
```

替换为：

```xml
            <view class="node-circle node-{{item.status}}">
              <view class="icon ic-check-white node-check" wx:if="{{item.status === 'done'}}"></view>
              <text class="node-mastery-in" wx:else>{{item.mastery}}%</text>
            </view>
            <view class="node-label">
              <text class="node-title">{{item.title}}</text>
              <text class="node-sub">{{item.status === 'done' ? '已掌握' : '掌握度 ' + item.mastery + '%'}}</text>
            </view>
```

- [ ] **Step 2: 移除底部操作栏**

删除第 72-75 行：

```xml
  <!-- 底部操作栏 -->
  <view class="action-bar" wx:if="{{!loading && currentLessonTitle}}">
    <view class="btn" bindtap="startCurrent">开始当前关卡 · {{currentLessonTitle}}</view>
  </view>
```

---

### Task 8: map.wxss — node-lock→node-todo，清理 current 样式

**Files:**
- Modify: `miniprogram/pages/map/map.wxss`

- [ ] **Step 1: 删除 current 相关样式**

删除：

```css
.node-current {
  background: var(--green);
  width: 96rpx;
  height: 96rpx;
  flex-basis: 96rpx;
}

.node-current-ring {
  box-shadow: 0 0 0 8rpx rgba(95, 184, 148, .3);
}
```

以及 `.node-sub-current` 规则、`.node-tag` 与 `.node-left .node-tag` / `.node-right .node-tag` 规则、`/* 底部操作栏 */ .action-bar` 规则。

- [ ] **Step 2: node-lock 改为 node-todo 中性样式**

将两处 `.node-lock` 规则：

```css
.node-lock {
  background: #EDF1EE;
  border-color: var(--gray);
}
```

```css
.node-lock {
  width: 30rpx;
  height: 30rpx;
}
```

替换为：

```css
/* 未学习节点：纸面底色中性呈现，可自由点击 */
.node-todo {
  background: var(--paper);
}
```

并删除 `.node-title-lock` 规则。

---

### Task 9: 全量语法检查

**Files:** 无（验证任务）

- [ ] **Step 1: 检查全部改动 JS**

Run（PowerShell，逐条分号分隔）:
`node --check cloudfunctions/getCourseList/index.js; node --check cloudfunctions/knowledgeMap/index.js; node --check miniprogram/pages/study/study.js; node --check miniprogram/pages/map/map.js`
Expected: 全部无报错输出

---

### Task 10: 云函数上传部署

**Files:** 无（部署任务）

- [ ] **Step 1: 上传 getCourseList**

cloudbase MCP `manageFunctions`：action=updateFunctionCode，functionName=getCourseList，函数根目录 `cloudfunctions/getCourseList`

- [ ] **Step 2: 上传 knowledgeMap**

cloudbase MCP `manageFunctions`：action=updateFunctionCode，functionName=knowledgeMap，函数根目录 `cloudfunctions/knowledgeMap`

- [ ] **Step 3: 验证线上代码**

cloudbase MCP `queryFunctions` 确认两函数代码已更新（不含 'lock' 逻辑）

---

## Self-Review 记录

- **Spec 覆盖**：设计文档改动清单 4 大项 → Task 1/2/3-5/6-8 一一对应；验证要求 → Task 9/10。无遗漏。
- **占位符**：无 TBD/TODO，所有代码步骤均含完整代码。
- **一致性**：knowledgeMap 移除 `currentLessonTitle` 返回 → map.js/map.wxml 同步移除引用；节点状态取值仅 `done`/`todo`，WXML/WXSS 状态类名一致；`overview-cat` 类名在 Task 4（WXML）与 Task 5（WXSS）一致。
