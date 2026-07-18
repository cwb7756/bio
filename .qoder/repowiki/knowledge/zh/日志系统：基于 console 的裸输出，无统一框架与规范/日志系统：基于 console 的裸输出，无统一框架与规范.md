---
kind: logging_system
name: 日志系统：基于 console 的裸输出，无统一框架与规范
category: logging_system
scope:
    - '**'
source_files:
    - cloudfunctions/home/index.js
    - cloudfunctions/login/index.js
    - cloudfunctions/report/index.js
    - miniprogram/app.js
    - miniprogram/pages/ai/ai.js
---

本仓库未发现任何统一的日志框架或日志工具封装。前后端均直接使用原生 `console.log / console.error / console.warn` 进行输出，未引入 winston、bunyan、pino、log4js、debug 等第三方库，也未在 miniprogram/utils 或 cloudfunctions 下建立 logger 模块。

- 云函数侧（cloudfunctions/*）：每个云函数的 index.js 中仅在 catch 块内以 `console.error('xxx error:', err)` 形式打印错误堆栈，无结构化字段、无日志级别控制、无统一前缀。
- 小程序前端（miniprogram/**）：各页面 .js 文件中同样散落使用 `console.error(...)` 记录业务异常，app.js 中仅对基础库版本做兼容性提示式输出。
- 配置层面：.gitignore 忽略了 `cloudfunctions/**/*.log`、`logs/`、`*.log` 等常见日志文件模式，但仓库中并未产生任何实际日志文件或目录。

结论：该项目处于“无日志系统”状态——仅有零散的 console 调用，缺少日志级别策略、结构化字段约定、统一入口以及输出路由（控制台/文件/远端采集）。若后续需要完善，建议在前端与云函数分别引入轻量级结构化日志库并抽取统一 Logger 模块。