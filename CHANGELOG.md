# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial public release structure
- Comprehensive documentation (README, CONTRIBUTING, DEPLOYMENT)
- GitHub Actions CI workflow
- Security guidelines and ESLint plugins
- AI-powered features:
  - AI Chat (streaming responses)
  - AI Courseware generation
  - LLM-based course planning
- Complete learning system:
  - Knowledge map visualization
  - Quiz system with progress tracking
  - Mistake notebook
  - Flashcards review
- Gamification features:
  - Study pet progression
  - Achievement system
  - Learning statistics dashboard

### Changed
- Refactored authentication flow with proper OpenID isolation
- Enhanced security with rate limiting on login attempts
- Updated AI model integration to use Hunyuan-v3 / DeepSeek models

### Security
- Implemented strict user data isolation using `_openid`
- Removed client-side userID trust
- Added input validation across all cloud functions
- Rate limiting: 5 failed attempts → 15-minute lockout

---

## [1.0.0] - 2026-07-28

### Initial Release

#### 🎓 Learning Features
- **Course Learning**: Hierarchical curriculum navigation by chapter and lesson
- **Knowledge Map**: Interactive graph visualization of knowledge points and relationships
- **Quiz System**: 
  - Multiple question types (single/multi-choice)
  - Real-time scoring
  - Detailed answer explanations
  - Performance analytics dashboard
- **Mistake Notebook**: 
  - Auto-save wrong answers
  - Filterable by subject/topic
  - Export capability
- **Flashcards**: 
  - Spaced repetition support
  - Card flip animation
  - Progress tracking per deck

#### 🤖 AI Capabilities
- **AI Assistant**:
  - Context-aware biology Q&A
  - Streaming response rendering
  - Session history management
  - RAG-enhanced knowledge base
- **AI Course Generation**:
  - Dynamic outline creation from topics
  - Multi-scene slide generation
  - Text-to-Speech audio narration
  - Image synthesis for diagrams

#### 🎮 Gamification & Engagement
- **Study Pet**:
  - Level-up system based on study hours
  - Different visual states per level (0-5)
  - Interaction modes: feed, pat, sleep
- **Achievement System**:
  - Milestone badges (study streaks, quiz scores, etc.)
  - Visual achievement display page
- **Learning Dashboard**:
  - Daily/weekly/monthly activity charts
  - Time spent analysis
  - Subject distribution pie chart
  - Personalized recommendations

#### 👥 User Management
- **Authentication**:
  - WeChat native login
  - JWT-based session management
  - Email password backup auth
  - Password reset via email token
- **Profile**:
  - Nickname and avatar management
  - Privacy settings
  - Theme preferences (colorful/hand-drawn/retro)
- **Settings**:
  - Notification controls
  - Clear cache/data
  - App version info
  - Feedback submission form

#### 🔧 Technical Features
- **Cloud Functions** (Node.js):
  - Modular architecture with action routing
  - Proper error handling and logging
  - Pagination support for list operations
  - Environment variable injection for secrets
- **Mini-program Architecture**:
  - Custom TabBar navigation
  - Reusable components
  - Utility libraries (markdown renderer, sound player, cache manager)
  - Offline-first design patterns
- **Database Schema**:
  - Users collection with role-based access
  - Courses, lessons, videos hierarchy
  - Study progress tracking
  - Mistakes, flashcards, notebook (scope-based multi-user)
  - Achievements, pet state (user-specific)
  - Quiz questions catalog (shared resource)

#### 🛡️ Security Measures
- Strict `_openid` isolation for all user data operations
- No trust in client-supplied identity fields
- Input validation at API boundaries
- Sensitive data masking in responses
- Secure secret management via environment variables

---

## Legend

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be-removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements or vulnerabilities

---

**Note**: This changelog starts from the initial public release. Future releases will follow this format.
