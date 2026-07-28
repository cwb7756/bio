# Deployment Guide for Bio

This guide covers deployment of the Bio project to production environments.

## 📋 Prerequisites

Before deploying, ensure you have:

- Admin access to WeChat Official Account / Mini-program Backend
- A registered WeChat Mini-program account
- CloudBase (微信云开发) environment set up
- Node.js 16.x or higher installed locally
- WeChat Developer Tools installed

## 🚀 Quick Deployment

### 1. Deploy to WeChat Cloud Development

#### Step 1: Set Environment Variables
In the WeChat DevTools console:
1. Open the project
2. Go to Cloud Base → Environment Management
3. Note your environment ID (e.g., `bio-d9gzmnqrif819033f`)
4. Configure environment variables for cloud functions:
   - `JWT_SECRET` (for admin module)
   - `TENCENT_SECRET_ID`, `TENCENT_SECRET_KEY` (for Tencent AI services)
   - `TTS_VOICE` (for text-to-speech voice selection)

#### Step 2: Update Configuration Files
Update the environment ID in:
- `miniprogram/app.js` (line 8): `env: "your-env-id"`

#### Step 3: Install Dependencies
Run in each cloud function directory:
```bash
cd cloudfunctions/<function-name>
npm install
```

Or run globally:
```bash
for (let d of Get-ChildItem cloudfunctions -Directory) {
    cd $_.FullName
    npm install
}
```

#### Step 4: Upload Cloud Functions
In WeChat Developer Tools:
1. Right-click on each cloud function directory
2. Select "Upload & Deploy: Cloud Installation" (or similar option)
3. Wait for deployment to complete

Or use the CloudBase CLI (command line):
```bash
npm install -g @wechat-miniprogram/devcli
wxdevcli cf deploy
```

### 2. Submit Mini-program for Review
1. In WeChat Developer Tools, click "Submit"
2. Fill in the submission form:
   - Category selection (Education > Biology)
   - Service content description
   - Privacy policy URL (if required)
3. Click "Submit for Review"
4. Wait for WeChat approval (typically 1-3 business days)

### 3. Release Version
Once approved:
1. Go to Mini-program Backstage (mp.weixin.qq.com)
2. Navigate to "Content Management" → "Release"
3. Click "Release" to make the app live

## 🔧 Cloud Function Deployment Strategy

### Individual Function Deployment
For targeted updates, deploy specific functions:

```bash
# Example: Deploy only login function
cd cloudfunctions/login
npm install
# Then upload via WeChat Developer Tools
```

### All Functions Deployment
Deploy all cloud functions sequentially:

```powershell
Get-ChildItem cloudfunctions -Directory | ForEach-Object {
    cd $_.FullName
    npm install
    # Upload via developer tools or CLI
}
```

## 🔄 Continuous Deployment (Optional)

For advanced CI/CD, consider setting up GitHub Actions with CloudBase CLI integration. See the [CI Workflow](.github/workflows/ci.yml) for baseline configuration.

## ✅ Post-Deployment Checklist

After deployment, verify:

- [ ] Home page loads correctly
- [ ] Login functionality works
- [ ] Course listing displays data
- [ ] Quiz system responds correctly
- [ ] AI Chat returns answers
- [ ] User data persists across sessions
- [ ] Error logs show no critical failures
- [ ] Performance meets acceptable thresholds (< 2s page load)

## 📊 Monitoring and Maintenance

### Logging
- Check CloudBase Console → Logs for errors
- Monitor usage metrics in CloudBase Dashboard
- Set up alerts for critical failures

### Updates and Patches
1. Make changes in local development
2. Run syntax checks: `node --check cloudfunctions/<name>/index.js`
3. Test in WeChat Developer Tools
4. Deploy to a staging environment first
5. Promote to production after verification

## 🔒 Security Considerations

1. **Regularly Rotate Secrets**: Update JWT_SECRET and API credentials periodically
2. **Monitor API Usage**: Watch for unusual traffic patterns indicating abuse
3. **Review Permissions**: Periodically audit cloud function permissions in config.json
4. **Update Dependencies**: Keep npm packages updated with security patches

## 💡 Tips

- Always test major changes in a staging environment before production
- Document breaking changes in CHANGELOG.md
- Use feature flags for gradual rollouts
- Maintain backward compatibility when possible

## 🆘 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Cloud functions fail to deploy | Check `config.json` permissions; ensure node_modules installed |
| Database connection errors | Verify env ID matches in `app.js`; check network connectivity |
| AI responses fail | Confirm environment variables for AI providers are set |
| Login fails | Check OpenID isolation logic; verify database schema |

For more troubleshooting steps, see the [README](README.md) or create an issue on GitHub.

---

**Last Updated**: 2026-07-28
