# App Backend — Member 3 (Backend Application Lead)

Node.js + Express + TypeScript backend. Firebase integration, business logic,
progress tracking, quiz APIs, and admin APIs.

## Status: Task 1 — Set Up Express Backend Architecture and Environment ✅

What's included so far:
- Express + TypeScript project scaffold with strict typing
- Layered folder structure (`controllers`, `routes`, `services`, `models`, `middlewares`, `utils`, `config`, `types`)
- Centralized error handling (`AppError`, `errorHandler`, `notFoundHandler`)
- Request logging (morgan → winston)
- Security middleware (helmet, cors)
- Environment config loader (`src/config/env.ts`)
- Firebase Admin SDK wired up (`src/config/firebase.ts`) — inactive until credentials are added
- Working health-check endpoint at `GET /api/v1/health`
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
|-------------------|-----------------------------------|
| `npm run dev`     | Start dev server with hot reload |
| `npm run build`   | Compile TypeScript to `dist/`    |
| `npm start`       | Run compiled build                |
| `npm run lint`    | Lint the codebase                 |
| `npm run format`  | Auto-format with Prettier         |
| `npm test`        | Run Jest tests                    |

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

## Firebase setup (needed before Task 3: Firebase Auth integration)

1. Go to Firebase Console → Project Settings → Service Accounts
2. Generate a new private key (downloads a JSON file)
3. Map these fields into `.env`:
   - `FIREBASE_PROJECT_ID` ← `project_id`
   - `FIREBASE_CLIENT_EMAIL` ← `client_email`
   - `FIREBASE_PRIVATE_KEY` ← `private_key` (keep the `\n` characters as-is)

## Next tasks (per project plan)

- [ ] Implement API standards, validation (Zod), and refine logging/error handling
- [ ] Integrate Firebase Authentication and role authorization
- [ ] Design and implement Firestore schemas
- [ ] User profile & learning preference APIs
- [ ] Curriculum/grade/subject/topic APIs
- [ ] Quiz storage & submission APIs
- [ ] Quiz scoring & answer review logic
- [ ] Lesson history & progress tracking APIs
- [ ] Weak topics, streaks, dashboard summary
- [ ] Notification preferences & FCM workflow
- [ ] Admin management & statistics APIs
- [ ] API docs (OpenAPI) & integration tests
