# Security Policy

## Supported Versions

We actively support and provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability

We take the security of **Bio** very seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### 🚨 How to Report

**Please do NOT publicly post security issues on GitHub Issues.** Instead, use our private reporting process:

1. **Email Us**: Send a detailed description to [`cwb7756@example.com`](mailto:cwb7756@example.com)
2. **Subject Line Format**: `[SECURITY] <Brief Description>`
3. **Include the Following**:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact
   - Suggested fix (if any)

### ⏰ Response Timeline

We commit to the following response times:

- **Initial Acknowledgment**: Within 48 hours
- **Status Update**: Weekly if investigation is ongoing
- **Resolution Target**: Within 14 days (depending on complexity)

### 🔐 What We'll Do

After receiving your report, we will:

1. **Investigate** the reported vulnerability
2. **Verify** whether it's a valid security issue
3. **Notify** you once the issue is resolved
4. **Credit** you in our acknowledgments (optional)

---

## Recommended Security Practices

If you're contributing to or using this project, please follow these guidelines:

### For Developers

1. **Never hardcode secrets**: Use environment variables only
2. **Validate all inputs**: Sanitize user data before processing
3. **Keep dependencies updated**: Regularly review npm packages for vulnerabilities
4. **Follow secure coding practices**: Adhere to OWASP recommendations

### For Users

1. **Use official releases**: Download from trusted sources only
2. **Enable two-factor authentication**: On your WeChat account
3. **Report suspicious activity**: Contact us immediately
4. **Keep software updated**: Install latest patches promptly

---

## Known Security Features

This project implements the following security measures:

- ✅ **OpenID Isolation**: All user data operations use `_openid` for strict data separation
- ✅ **JWT Authentication**: Secure session management with token expiration
- ✅ **Rate Limiting**: Login attempt limiting (5 attempts → 15-minute lockout)
- ✅ **Input Validation**: Sanitization at API boundaries
- ✅ **Environment Variables**: Secret management via CI/CD injected env vars
- ✅ **No Client-Side Trust**: Never trust userID/openid from client requests

---

## Security Updates & Announcements

Stay informed about security updates by:

- Watching this repository on GitHub
- Checking the [CHANGELOG](../CHANGELOG.md) for security patches
- Subscribing to our release notifications

---

## Security Research Guidelines

We encourage responsible security research:

✅ **We appreciate security research on this project!**  
📋 Before performing security testing, please agree to the following:

- Focus on analyzing application security from an external attacker perspective
- Make every effort to avoid privacy violations, disruption of service, or damage to data
- Follow legal principles outlined in the [OWASP Vulnerability Disclosure Guidelines](https://owasp.org/www-project-vulnerability-disclosure-toolkit/#5.-publish-responsibly)

---

## PGP Keys

For encrypted communications, please use the following PGP key:

```
PGP Key ID: [TODO - Add Your Key ID]
Fingerprint: [TODO - Add Fingerprint]
```

Contact us at `cwb7756@example.com` for the full public key.

---

<div align="center">

Thank you for helping keep Bio safe! 🛡️

Last Updated: July 28, 2026

</div>
