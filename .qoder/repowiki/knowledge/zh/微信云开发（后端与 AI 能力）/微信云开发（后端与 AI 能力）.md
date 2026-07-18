---
kind: external_dependency
name: 微信云开发（后端与 AI 能力）
slug: wechat-cloud-development
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

### 身份与角色
- 本项目后端完全基于微信云开发，小程序通过 `wx.cloud.init` 直连云环境，所有业务逻辑以 Node.js 云函数形式部署在 `cloudfunctions/` 下。
- 同时使用云数据库（集合：`users`、`ai_chat_sessions`、`courses`、`lessons`、`quiz_questions` 等）、云存储（生成小程序码上传），以及云开发内置的 AI 接入能力（hunyuan-v3 / deepseek 模型）。AppID 为 `wx4c5f356832d6af06`，云环境 ID 硬编码在 `miniprogram/app.js` 中。

### 集成要点
- 云开发 AI 能力在 `aiChat` 云函数中以 RAG 方式调用：先匹配课程/课时/题目作为 systemPrompt，再转发给云开发 AI 模型进行流式对话。