# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Web admin panel (`webadmin/`): React 18 + Vite + Tailwind CSS dashboard managing users, courses, knowledge points, quiz questions, mistakes, achievements, 3D models, feedback and settings via the `admin` cloud function (JWT auth)
- Admin batch operations: bulk user ban/unban (`user.batchUpdateStatus`) and bulk quiz question deletion (`quiz.batchDelete`), up to 100 items per call with role-based permission checks
- Admin mistake management (`mistakesModule`): mistake list query, export and batch deletion with `_openid`/`userID` compatibility
- 3D model library:
  - `modelLibrary` cloud function serving model list and temporary download URLs
  - Admin model management (`modelModule`) with base64 upload, format validation and CRUD
  - `packages/3d-model` subpackage with gallery and viewer pages (xr-frame rendering)
  - Custom gesture controls: one-finger rotation, two-finger pinch zoom and inertial gliding, replacing camera-orbit-control
  - Dynamic `xr-gltf` creation after model load for accurate loading states
- Personalized course entry on home page, marked as premium with rotating-glow button animation; grid layout rebuilt with CSS Grid
- Back button on login page; project logo replaces the flame icon
- Programmatic 3D model toolchain (`tools/`): shared `glb-builder` (MeshBuilder) library with generators for DNA double helix, animal cell, chloroplast, mitochondria and bacteriophage models
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
- Unified knowledge field naming across backend and webadmin: knowledge point `content` → `desc`, graph node `name` → `title` (with new difficulty field), edge `relation` → `type`, flashcard front/back → title/content
- Home quick entry switched from flashcards to the 3D model library
- Study page simplified: knowledge-map related UI and logic removed
- Viewer page: status-bar height adaptation, back button and updated gesture hints
- Bumped project `libVersion` to 3.17.0
- Refactored authentication flow with proper OpenID isolation
- Enhanced security with rate limiting on login attempts
- Updated AI model integration to use Hunyuan-v3 / DeepSeek models

### Removed
- GLTFLoader and all glTF extension code from three-platformize (DRACO/KTX2/Meshopt handling, material and lighting extensions), significantly reducing bundle size

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
