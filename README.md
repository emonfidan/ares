# ARES-X — Integrated Adaptive Survey Ecosystem

## Project Structure

```
ares/
├── backend/         # Express.js API server (surveys, auth, GBCR algorithm)
│   ├── services/    # Core business logic (surveyService.js — DAG, conflict resolution)
│   ├── routes/      # API routes (survey CRUD, auth endpoints)
│   ├── __tests__/   # TDD unit & integration tests (Jest + Supertest)
│   └── data/        # JSON persistence (surveys.json, users.json, responses/)
├── frontend/        # React (Vite) web application — Survey Architect
│   └── src/
│       ├── components/admin/   # AdminSurveyBuilder — DAG survey designer
│       ├── components/survey/  # SurveyPlayer, SurveyPage — DAG renderer + conflict UI
│       └── services/           # API client layer
├── mobile/          # React Native (Expo) native Android client
│   └── src/
│       ├── screens/            # LoginScreen, DashboardScreen, SurveyScreen
│       ├── components/         # QuestionRenderer (6 types), ConflictBanner
│       └── services/           # API client for mobile
├── selenium/        # Selenium E2E tests for Web (12 test files)
│   └── tests/
└── appium/          # Appium E2E tests for Mobile (10 test cases + sync test)
    ├── tests/
    └── utils/
```

## LLM Usage

This project was developed with the assistance of **Gemini 2.5 Flash** for:
- Backend fraud detection (real-time LLM risk scoring via Gemini API)
- Code generation assistance for boilerplate components
- Test case design and E2E scenario planning

## Setup & Running

### Prerequisites
- Node.js ≥ 18
- Android Studio + Android Emulator (for mobile)
- Appium + UiAutomator2 driver (for mobile tests)

### Environment Variables

Create `.env` files from the provided `.env.example` files:
- `backend/.env` — GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GEMINI_API_KEY, E2E_MODE
- `selenium/.env` — FRONTEND_URL

---

### Terminal 1 — Backend
```bash
cd backend
npm install
node server.js
```

### Terminal 2 — Web Frontend
```bash
cd frontend
npm install
npm run dev
```

### Terminal 3 — Mobile App
```bash
cd mobile
npm install
npx expo start
# Press 'a' for Android emulator
```

### Terminal 4 — Selenium Tests (Web)
```bash
cd selenium
npm install
npm run test:all
```

### Terminal 5 — Appium Tests (Mobile)
```bash
cd appium
npm install
npm run test:all
```

## Test Users

| Email | Password | Risk Level |
|---|---|---|
| clean@example.com | Password123! | LOW |
| traveler@example.com | Password123! | MEDIUM |
| challenged@example.com | Password123! | Challenged |
| risky@example.com | Password123! | HIGH |
| admin@admin.com | admin123 | Admin |

## Key Algorithms

### GBCR (Graph-Based Conflict Resolution)
- Located in `backend/services/surveyService.js`
- `detectConflict()` — Compares survey versions, finds orphaned answers
- `atomicStateRecovery()` — Remaps answers to new DAG without data loss
- `findLastStableNode()` — Identifies safe rollback point

### RCLR (Recursive Conditional Logic Resolution)
- `resolveVisibleQuestionIds()` — Walks DAG from entry, evaluates conditions
- `evaluateCondition()` — Operators: equals, notEquals, in, notIn
- `isPathComplete()` — Checks all required visible questions + validation
