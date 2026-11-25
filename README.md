# JobTracker

A cross-platform Expo app for tracking job applications, backed by an Express REST API and SQLite database.

## Get started

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`.
3. Start the API: `npm run api`
4. In a second terminal, start Expo: `npm run web` or `npm start`.

The API listens on `http://127.0.0.1:3001` by default and creates its SQLite database at `server/data/jobtracker.sqlite`.
The app's default API URL is `http://localhost:3001/api`.

Create an account in the app on first use. Passwords are hashed with Node.js `scrypt`; the API stores only hashes of random bearer session tokens. Native sessions are stored with Expo SecureStore, and web sessions use browser session storage. Sessions expire after 30 days and can be revoked by signing out.

For an Android emulator, set `API_HOST=0.0.0.0` and `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001/api`. For a physical device on the same network, also bind to `0.0.0.0` and use the development computer's LAN IP in the API URL. Add the web app's origin to `EXPO_WEB_ORIGINS` if it differs from the defaults.

The API is configured for local development and binds to loopback by default. Authentication rate limiting uses an in-memory store, so before public deployment configure HTTPS, persistent rate limiting, secure backups, and production hosting appropriate to your threat model. The first account registered against an existing database takes ownership of its previously unowned applications; subsequent accounts see only their own records. Existing applications in AsyncStorage are imported into the signed-in account on its first successful API connection.

## API

- `GET /api/health` — API health check.
- `POST /api/auth/register` and `POST /api/auth/login` — create an account or start a session (`email`, `password`; passwords must be at least 12 characters).
- `GET /api/auth/me` — read the signed-in account.
- `POST /api/auth/logout` — revoke the current session.
- `GET /api/profile` and `PUT /api/profile` — read or save the signed-in user's candidate profile.
- `POST /api/profile/parse-resume` — parse a PDF or DOCX resume up to 5 MB and return candidate details. The uploaded file is processed in memory and is not retained.
- All `/api/jobs` routes require `Authorization: Bearer <token>` and are scoped to that account:
  - `GET /api/jobs` and `GET /api/jobs/:id` — list or read applications.
  - `POST /api/jobs` — create an application.
  - `POST /api/jobs/import` — idempotently import prior device-local records.
  - `PUT /api/jobs/:id` — edit an application.
  - `PATCH /api/jobs/:id/status` — change its status.
  - `DELETE /api/jobs/:id` — delete an application.

The API validates request bodies, applies Helmet security headers, limits authentication attempts, restricts browser origins to the configured origins, and binds to loopback by default. SQLite schema upgrades preserve existing job rows and associate unowned rows with the first registered account.

## App features

- View application totals and pipeline status on the Home tab.
- Add and edit applications, including company, role, location, salary, application link, notes, and status.
- Search by role, company, location, salary, or notes.
- Filter by application status and sort by newest or oldest.
- Change status, open a saved job link, or remove an application.
- Create an account, sign in/out, and keep application records isolated by account.
- Parse a resume to prefill a candidate profile with name, email, phone, and skills; review and edit the details before saving.

## Checks

```bash
npm run test:api
npm run lint
npx tsc --noEmit
```
