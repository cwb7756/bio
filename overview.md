# Bio 小程序介绍视频 — 交付概览

## 产出

**`remotion-videos/output/bio-app-intro.mp4`** — 30 秒竖屏介绍视频（1080×1920，30fps，MP4 H.264 + 音轨，3.6 MB）

主题：高中生 vibe coding 作品《Bio · 高中生物学习助手》，重点展示 AI 个性化课程功能。

## v2 更新（2026-07-27）

- 🎵 **BGM**："Bouncy Pa-Ra-Pam"（innabar，CC BY 3.0 商用安全），24s 循环，开头淡入/结尾淡出，音量 0.45
- 🖼️ **Logo**：结尾场景换新 Bio logo（白底圆角卡片，黑描边手账风），替换原 🧬 emoji
- 📱 **截图放大**：功能场景手机 mockup 470→550px，AI 课程场景 440→500px，并修复放大后的布局间距

## 分镜结构（7 场景）

| 时间 | 场景 | 内容 |
|---|---|---|
| 0-3.5s | 开场钩子 | 深绿底 + 代码符号漂浮，"一个高中生，用 AI 写出了一个生物学习 App" |
| 3.5-8.3s | 产品亮相 | 首页截图手机 mockup，刷题/错题本/速记/知识图解四大工具标签 |
| 8.3-14.3s | **AI 个性化课程**（重点） | 发光 AI 徽章 + ✨粒子，AI 生成动画课件/分步图解/自动播放三大特性 |
| 14.3-19.3s | 智能刷题 | 刷题页截图，即时解析/进度追踪/题库全覆盖 |
| 19.3-23.8s | 考点地图 | 30 核心考点、进度可视化、薄弱点定位 |
| 23.8-27.3s | B 站课程 | 精选百万播放课程，课时化学习 |
| 27.3-30s | 结尾 CTA | Bio 白底 logo，"用 AI 编程 × 用 AI 学习"，小程序搜索引导 |

## 音乐署名（ATTRIBUTION）

"Bouncy Pa-Ra-Pam" by innabar — Source: https://ccmixter.org/files/innabar/13286 — License: CC Attribution 3.0
（发布视频时建议在简介中保留此署名，完整文件见 `remotion-videos/public/assets/ATTRIBUTION.txt`）

## 设计

- 沿用小程序自身视觉语言：护眼薄荷绿 `#E8F5E9`、深绿 `#14301C`、黄色高亮 `#FFD54F`
- 手账风贴纸标签（白底黑描边）、手机 mockup 展示真实截图
- 全部动画使用 spring/interpolate 物理曲线，无 CSS transition

## 源码位置

`remotion-videos/src/compositions/bio-app-intro/`（7 个场景组件 + 共享组件库），修改文案后重新渲染：

```bash
cd remotion-videos
npx remotion render src/index.ts bio-app-intro output/bio-app-intro.mp4
```

## 后续可选

- 换 BGM：把新 mp3 放进 `public/assets/` 并改 `VideoComposition.tsx` 中 Audio 的 src
- 调整文案/时长/场景顺序（改 `VideoComposition.tsx` 的 Sequence 时间线）
- 预览调试：`npx remotion studio`（本地 3000 端口）
