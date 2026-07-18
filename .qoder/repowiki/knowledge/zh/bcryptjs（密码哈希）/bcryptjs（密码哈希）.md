---
kind: external_dependency
name: bcryptjs（密码哈希）
slug: bcryptjs
category: external_dependency
category_hints:
    - sdk_real_api
scope:
    - '**'
---

### 身份与角色
- 仅 `login` 云函数引入 bcryptjs，用于邮箱注册时以 salt=10 对明文密码做 bcrypt 哈希，登录时通过 `bcrypt.compare` 校验。

### 集成要点