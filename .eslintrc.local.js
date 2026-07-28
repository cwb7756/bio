/**
 * ESLint 本地插件配置文件
 * 为本地开发环境提供自定义安全规则的配置
 */

module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    es2022: true,
    node: true,
  },
  plugins: ['bio-security'],
  rules: {
    'bio-security/no-trust-userid': 'error',
    'bio-security/require-openid-isolation': 'error',
  },
};
