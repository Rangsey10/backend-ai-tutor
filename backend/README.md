# App Backend — Member 3 (Backend Application Lead)

Node.js + Express + TypeScript backend. Firebase integration, business logic,
progress tracking, quiz APIs, and admin APIs.

## Status: Task 1 — Set Up Express Backend Architecture and Environment ✅

## Status: Task 5 — Develop User Profile and Learning Preference APIs ✅

What's included so far:

- Express + TypeScript project scaffold with strict typing
- Layered folder structure (`controllers`, `routes`, `services`, `models`, `middlewares`, `utils`, `config`, `types`)
- Centralized error handling (`AppError`, `errorHandler`, `notFoundHandler`)
- Request logging (morgan → winston)
- Security middleware (helmet, cors)
- Environment config loader (`src/config/env.ts`)
- Firebase Admin SDK wired up (`src/config/firebase.ts`) — inactive until credentials are added
- Working health-check endpoint at `GET /api/v1/health`
- Firebase Authentication middleware (`authenticate`, `authorize`)
- Zod request validation middleware
- API response helpers (`sendSuccess`, `sendCreated`, `sendNoContent`)
- Firestore schemas for users, student_profiles, grade_levels, subjects, topics, student_subjects (and all MVP entities)
- Firestore converters for type-safe reads/writes
- Profile management APIs (6 endpoints for student onboarding and learning preferences)
- Unit tests for profile service layer (Jest mocks for Firestore)
- ESLint + Prettier + Jest configured
- `.gitignore` and `.env.example` in place

## Getting started

```bash
npm install
cp .env.example .env      # fill in Firebase credentials when ready
npm run dev                # starts on http://localhost:4000
```

Verify it's working:

```bash
curl http://localhost:4000/api/v1/health
```

## Scripts

| Command          | Purpose                          |
| ---------------- | -------------------------------- |
| `npm run dev`    | Start dev server with hot reload |
| `npm run build`  | Compile TypeScript to `dist/`    |
| `npm start`      | Run compiled build               |
| `npm run lint`   | Lint the codebase                |
| `npm run format` | Auto-format with Prettier        |
| `npm test`       | Run Jest tests                   |

## Project structure

```
src/
  config/       # env, firebase admin init
  controllers/  # request handlers (business logic entry points)
  routes/       # route definitions, mounted under /api/v1
  middlewares/  # error handling, logging, auth (coming next)
  services/     # business logic / Firestore access layer
  models/       # TypeScript types & Firestore schema shapes
  utils/        # logger, AppError, helpers
  types/        # shared TS types
  app.ts        # Express app config
  server.ts     # entry point
```

## API Endpoints

### Profile Management (Task 5 — User Profile and Learning Preference APIs)

All endpoints under `/api/v1/profile` are protected by authentication (`authenticate` middleware). Students can only access their own profile.

| Method   | Endpoint                              | Description                                                                 |
| -------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `GET`    | `/api/v1/profile`                     | Get current user's profile, merged with user info and selected subjects     |
| `POST`   | `/api/v1/profile`                     | Create profile (onboarding) with grade level, preferences, and subjects     |
| `PATCH`  | `/api/v1/profile`                     | Update learning preferences (explanation_level, learning_goal, grade_level) |
| `GET`    | `/api/v1/profile/subjects`            | Get student's selected subjects with metadata                               |
| `POST`   | `/api/v1/profile/subjects`            | Add a new subject selection                                                 |
| `DELETE` | `/api/v1/profile/subjects/:subjectId` | Remove a subject selection (soft delete)                                    |

**Notes:**

- GET `/api/v1/profile` returns 404 if no profile exists yet (onboarding not completed).
- POST `/api/v1/profile` validates that grade_level_id and all subject_ids exist before creation.
- PATCH `/api/v1/profile` rejects backend-managed fields (current_streak, longest_streak, total_learning_time).
- POST `/api/v1/profile/subjects` returns 409 Conflict if subject already selected.
- DELETE `/api/v1/profile/subjects/:subjectId` soft-deletes the student_subjects record (status → 'inactive').

## Firebase setup (needed before Task 3: Firebase Auth integration)

1. Go to Firebase Console → Project Settings → Service Accounts
2. Generate a new private key (downloads a JSON file)
3. Map these fields into `.env`:
   - `FIREBASE_PROJECT_ID` ← `project_id`
   - `FIREBASE_CLIENT_EMAIL` ← `client_email`
   - `FIREBASE_PRIVATE_KEY` ← `private_key` (keep the `\n` characters as-is)

## Next tasks (per project plan)

- [x] Implement API standards, validation (Zod), and refine logging/error handling
- [x] Integrate Firebase Authentication and role authorization
- [x] Design and implement Firestore schemas
- [x] User profile & learning preference APIs
- [ ] Curriculum/grade/subject/topic APIs
- [ ] Quiz storage & submission APIs
- [ ] Quiz scoring & answer review logic
- [ ] Lesson history & progress tracking APIs
- [ ] Weak topics, streaks, dashboard summary
- [ ] Notification preferences & FCM workflow
- [ ] Admin management & statistics APIs
- [ ] API docs (OpenAPI) & integration tests
