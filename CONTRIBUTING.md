# Contributing to Bio

Thank you for your interest in contributing to the Bio project! This document provides guidelines for contributing to this high school biology learning mini-program.

## 🌟 How Can I Contribute?

### Bug Reports
- Create an issue with a clear title and detailed description
- Include steps to reproduce the issue
- Mention the environment (WeChat Developer Tools version, Node.js version)
- Attach screenshots or logs if applicable

### Feature Requests
- Open an issue with a clear description of the proposed feature
- Explain why this feature would benefit other users
- Provide mockups or examples if possible

### Code Contributions
- Fork the repository
- Create a new branch (`git checkout -b feature/amazing-feature`)
- Make your changes
- Test thoroughly in WeChat Developer Tools
- Commit with clear messages
- Push to your fork and submit a pull request

## 📝 Development Guidelines

### Coding Style

#### Cloud Functions (Node.js)
- Use ES2022 syntax
- Follow ESLint rules configured in the project
- Always use `cloud.getWXContext()` for user identification
- Never trust client-side `userID` or `openid` parameters
- Implement input validation at function entry points

#### Mini-program Frontend
- Follow the existing code structure and conventions
- Use WXML + WXSS for pages
- Write modular JavaScript code
- Implement proper error handling

### Security Best Practices

1. **User Data Isolation**: Always use `_openid` from `cloud.getWXContext()` for data operations
2. **Input Validation**: Validate all inputs to prevent injection attacks
3. **Sensitive Data**: Never hardcode API keys or secrets; use environment variables
4. **Rate Limiting**: Implement rate limits for API endpoints where appropriate

### Git Workflow

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add your feature description"

# Push to your fork
git push origin feature/your-feature-name
```

### Pull Request Process

1. Ensure your code follows the project's coding standards
2. Update documentation as needed
3. Add tests for new features when applicable
4. Write a clear PR description explaining what changed and why
5. Assign reviewers from the core team
6. Address feedback and make necessary changes

## 🐛 Reporting Bugs

Please provide the following information when reporting bugs:

- **Description**: Clear and concise description of the problem
- **Steps to Reproduce**: Numbered list of steps to reproduce the bug
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**: 
  - WeChat Developer Tools version
  - Platform (iOS/Android simulator)
  - Network conditions

## ✨ Feature Requests

For feature requests, please include:

- Problem statement: What problem are you trying to solve?
- Proposed solution: How do you think it should be implemented?
- Alternatives considered: Any other approaches you've thought about?
- Additional context: Screenshots, references, etc.

## Code Review

All contributions require code review. The team will review your changes for:

- Code quality and maintainability
- Security implications
- Performance considerations
- Alignment with project goals

Be patient and responsive to feedback. Your contribution is valuable, and we want to help you make it the best it can be!

## Questions?

If you have questions that aren't related to specific code issues, feel free to open an issue tagged as "question".

---

Thank you for being part of the Bio community! 🙏
