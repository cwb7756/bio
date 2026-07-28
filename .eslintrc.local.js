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
