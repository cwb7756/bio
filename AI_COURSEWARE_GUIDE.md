# AI Courseware Guide

## Overview
This guide documents the AI-powered course generation system for Bio mini-program.

## Features
- Dynamic outline generation from topic questions
- Multi-scene breakdown (concept, diagram, example, quiz)
- TTS audio narration support
- Structured JSON output for frontend rendering

## Cloud Function API

### generateOutline
**Action**: `generateOutline`

**Input**:
```json
{
  "question": "细胞如何进行能量代谢？"
}
```

**Output**:
```json
{
  "success": true,
  "data": {
    "title": "细胞能量代谢",
    "sections": [
      {
        "id": 1,
        "title": "ATP - 细胞的能量货币",
        "scenes": [...]
      }
    ]
  }
}
```

### generateScenes
**Action**: `generateScenes`

**Input**:
```json
{
  "sectionTitle": "ATP - 细胞的能量货币",
  "targetGrade": "high_school",
  "sceneTypes": ["concept", "diagram", "example"]
}
```

**Output**:
```json
{
  "success": true,
  "data": {
    "scenes": [
      {
        "type": "concept",
        "text": "ATP is...",
        "audioFile": "https://..."
      }
    ]
  }
}
```

## Scene Types

| Type | Description |
|------|-------------|
| concept | Core concept explanation |
| diagram | Visual diagram description |
| example | Real-world application examples |
| quiz | Practice questions for reinforcement |

## Integration

### Frontend Usage
```javascript
const result = await wx.cloud.callFunction({
  name: 'aiCourseware',
  data: {
    action: 'generateOutline',
    question: query
  }
});
```

## Security
- Input validation at API boundary
- Rate limiting enabled
- No hardcoded secrets in codebase

---

Last Updated: July 28, 2026
