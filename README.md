# pkba.nl Generate Report Platform

Multi-tenant, role-based report generation for pkba.nl. Users can only generate and download their own tenant reports. Admins manage tenants, users, and jars.

## Structure

```
frontend/       Next.js (Vercel)
backend/api/    Express API (Railway)
backend/worker/ Worker/Runner (Railway)
migrations/     Postgres SQL migrations
```

## Key Security Properties

- Tenant isolation is enforced server-side by deriving `tenant_id` from JWT only.
- Every query includes `tenant_id` filters where applicable.
- Reports are downloadable via single-use tokens that expire quickly.
- JAR execution happens only in the worker service.
- Cookies are `HttpOnly` with `SameSite=Strict` and origin checks for state-changing requests.

## Local Development

### 1) Database

Create a Postgres database and apply migrations from [migrations/001_init.sql](migrations/001_init.sql).

### 2) API

```
cd backend/api
cp .env.example .env
npm install
npm run dev
```

### 3) Worker

```
cd backend/worker
cp .env.example .env
npm install
npm run dev
```

### 4) Frontend

```
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend defaults to http://localhost:3001 and API defaults to http://localhost:4000.

## Deployment

### Vercel (Frontend)

Set env vars:

- `NEXT_PUBLIC_API_BASE_URL=https://api.pkba.nl`

### Railway (API)

Set env vars from [backend/api/.env.example](backend/api/.env.example).

Start command:

```
npm run start
```

### Railway (Worker)

Set env vars from [backend/worker/.env.example](backend/worker/.env.example).

Start command:

```
npm run start
```

### Object Storage

Use AWS S3 or Cloudflare R2 with S3-compatible credentials. Ensure bucket permissions allow read/write by the services.

## API Summary

Auth:

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Admin:

- `POST /admin/tenants`
- `GET /admin/tenants`
- `POST /admin/users`
- `POST /admin/jars`
- `GET /admin/jars?tenantId=...`
- `POST /admin/tenants/:tenantId/active-jar`
- `GET /admin/jobs?tenantId=...`

User:

- `POST /reports/run`
- `GET /reports/jobs/:jobId`
- `POST /reports/jobs/:jobId/download-token`
- `GET /reports/download/:token`

## Worker Notes

The worker runs jar files in an isolated temp directory, with a strict timeout and no user-provided arguments. Each jar must output exactly one file into the temp directory. The newest file is taken as the report output.

## Legacy Files

The original static site remains under `public/` and `server.js` for reference, but the production system should use `frontend/` and `backend/`.
