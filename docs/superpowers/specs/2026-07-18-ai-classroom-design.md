# AI课堂（AI老师课件生成与TTS讲解）设计

日期：2026-07-18
参考：OpenMAIC（清华开源多智能体互动课堂）两阶段生成流水线的微信小程序原生裁剪版

## 1. 背景与目标

学生输入一个生物问题/主题，AI 老师自动生成一份**分阶段课件**并用 **TTS 语音**逐页讲解：

- 两阶段流水线：先生成课件大纲（学生可删除/改标题确认），再逐场景生成课件内容
- 课件纯前端原生渲染：不走 webview、不依赖任何外部资源（文本块用 WXML 原生渲染，图解/动画用 AI 生成的 SVG 字符串净化后转 data URI background-image，复用全局图标同套技术）
- 场景类型：图文幻灯片（cover/concept/summary）+ 图解页（diagram）+ 分帧动画模拟（sim，2-6 帧 SVG 关键帧序列播放）+ 随堂小测（quiz）
- 腾讯云 TTS 合成讲稿音频，逐页配音，支持自动连播
- 课件保存云端（ai_coursewares 集合，PRIVATE + _openid 隔离），历史列表可重播/删除
- 入口：aiHub 页现有「AI课堂」占位卡片激活，跳转新页面 pages/aiClassroom/aiClassroom

## 2. 已确认决策记录

| 决策点 | 结论 |
|---|---|
| 场景范围 | 图文幻灯片 + 随堂小测 + 分帧动画模拟 |
| 交互形态 | 分帧动画（AI 生成 2-6 帧 SVG 关键帧，帧级讲稿联动） |
| TTS 方案 | 腾讯云 TTS 付费版，云函数内调用（tencentcloud-sdk-nodejs-tts） |
| 课件存储 | 保存 + 历史列表（ai_coursewares 集合） |
| 生成流程 | 先大纲确认再逐场景生成 |
| 架构 | 前端 wx.cloud.extend.AI 直连（cloudbase 提供商 + hy3 模型，与 ai.js 一致）；云函数仅负责 TTS 与课件 CRUD |
| 入口 | aiHub「AI课堂」卡片 |

## 3. 课件 DSL（JSON）

```js
{
  title: string,        // 课件标题
  question: string,     // 原始问题
  scenes: [Scene]       // 4-7 个场景，首节 cover、末节 summary
}
```

Scene 按 type 分发：

```js
{ type: 'cover',   title, subtitle, narration }
{ type: 'concept', title, narration, blocks: [Block] }
{ type: 'diagram', title, narration, svg, caption }
{ type: 'sim',     title, narration, frames: [{ svg, caption, narration }] }  // 2-6 帧
{ type: 'quiz',    title, narration, question, options: [string], answer: 'A', explanation }
{ type: 'summary', title, narration, points: [string] }
```

Block 类型：

```js
{ kind: 'paragraph', text }
{ kind: 'bullets',   items: [string] }
{ kind: 'steps',     items: [string] }
{ kind: 'keypoint',  label, text }
{ kind: 'compare',   left: { title, items: [] }, right: { title, items: [] } }
{ kind: 'table',     head: [string], rows: [[string]] }
```

- narration 为每场景必填讲稿（≤600 字）；sim 场景每帧带独立 narration
- svg 必须是自包含 `<svg>` 字符串（viewBox 必备），禁止 script/事件属性/外部引用；前端净化后 `encodeURIComponent` 转 `data:image/svg+xml` URI 作为 view 背景图渲染；净化失败降级隐藏图形只显示文字

## 4. 云函数 aiCourseware（新建）

`cloudfunctions/aiCourseware/{index.js,package.json,config.json}`，鉴权沿用 `cloud.getWXContext().OPENID`。

- `action=tts`：入参 `{ text }`，服务端按标点切分为 ≤180 字段落，逐段调腾讯云 TTS `TextToVoice`，返回 `{ code:0, clips:[{ text, audioBase64 }] }`
  - 密钥取环境变量 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`，音色 `TTS_VOICE`（默认 101001 智瑜女声）
  - 未配置密钥返回 `{ code: 503, msg: 'TTS未配置' }`，前端静音降级
- `action=saveCourseware / listCoursewares / getCourseware / deleteCourseware`
  - 文档：`{ _openid, title, question, scenes, createdAt, updatedAt }`；列表 updatedAt 倒序上限 20；读写均 `_id + _openid` 双重校验（沿用 aiChat 模式）
- 部署：cloudbase MCP manageFunctions 上传；ai_coursewares 集合用 cloudbase MCP writeNoSqlDatabaseStructure 创建（PRIVATE 权限）

## 5. 前端工具层 utils/courseware.js（新建）

- 大纲 prompt / 场景 prompt 模板：强约束「只输出 JSON」，注入对应 sceneType 的 schema 示例
- 健壮 JSON 解析：优先提取 ```json 代码块，否则截取首尾花括号区间；parse 失败抛错供重试（重试 1 次后降级为 concept 纯文字页）
- SVG 净化器：剔除 script/foreignObject/use 标签、on* 事件属性、http(s)/javascript: 外部引用；净化后转 data URI
- TTS 文本清洗：去 Markdown 符号/emoji/多余空白

## 6. 前端页面 pages/aiClassroom/aiClassroom（新建）

四态状态机：`input → outline → generating → playing`

- **input 态**：问题输入框 + 推荐主题 chips + 历史课件列表（listCoursewares，点击直达 playing 重播，长按删除）；未登录拦截沿用 `app.globalData.isLoggedIn` + 跳登录页
- **outline 态**：`createModel('cloudbase')` + `generateText`（model 'hy3'）生成大纲（课件标题 + 4-7 节，每节 `{ title, sceneType, goal }`）；章节卡片支持删除、编辑标题；「开始生成」进入 generating
- **generating 态**：逐场景调 generateText 生成场景 JSON，进度展示「正在生成 第N节/共M节」；每场景成功即并行调云函数 tts 预取音频；全部完成写入 saveCourseware 并进入 playing；提供「先播放已完成部分」
- **playing 态**：
  - 顶栏：课件标题 + 页码 x/n + 关闭；底栏：上一页/播放暂停/下一页/重播/自动播放开关
  - 场景渲染器按 type 分发 WXML template；sim 场景帧播放器（帧切换联动该帧字幕与音频、进度点、逐帧按钮）；quiz 场景选项作答→对错反馈+解析
  - 音频链路：clips base64 → `wx.getFileSystemManager` 写 `wx.env.USER_DATA_PATH` 临时文件 → 单一 InnerAudioContext 顺序连播；onEnded 自动模式下翻页（sim 内先切帧再翻页）；播第 N 页预取第 N+1 页音频
  - 字幕区显示当前 narration，可收起
- 样式沿用 app.wxss 设计令牌与手绘组件类；缺的新图标（ic-pause、ic-volume、ic-chevron-left 等）按细线规范补进 app.wxss，禁止 emoji

## 7. aiHub 改造

- aiHub.js：`goClassroom` 改为 `wx.navigateTo({ url: '/pages/aiClassroom/aiClassroom' })`
- aiHub.wxml：移除 `hub-card-disabled`、「敬请期待」徽标与 `ic-lock`，描述改为「AI生成课件，语音讲解互动课堂」；配套 wxss 清理

## 8. 错误处理与降级

- LLM 生成失败：重试 1 次 → 该场景降级为 concept 文字页；全部失败 toast 回 input 态
- TTS 失败/未配密钥：该页静音播放（字幕+动画正常，定时翻页），toast 提示一次
- SVG 净化失败：隐藏图形区域，保留文字与讲稿
- 生成中途退出：已生成场景不落库，回 input 态

## 9. 前置条件（用户侧）

- 开通腾讯云 TTS 服务，准备 SecretId/SecretKey，配入云函数 aiCourseware 环境变量 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`（可选 `TTS_VOICE`）

## 10. 测试

- 每个 JS 文件改完 `node --check`
- 云函数上传后 cloudbase MCP 验证 tts（已配密钥时）与 CRUD 闭环
- 前端走查：以「光合作用」生成课件 → 大纲编辑 → 分阶段生成 → 播放（翻页/暂停/自动/动画帧/quiz 作答）→ 历史重播与删除
