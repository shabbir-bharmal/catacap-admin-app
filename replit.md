# CataCap Admin Frontend

## Overview
React 18 + TypeScript + Vite admin panel for the CataCap platform. Handles investments, user management, disbursal requests, and site configuration.

## Tech Stack
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite 7
- **Package Manager:** pnpm
- **Styling:** Tailwind CSS + Radix UI (shadcn/ui-style components)
- **State Management:** TanStack Query (React Query)
- **Routing:** wouter
- **Forms:** React Hook Form + Zod
- **HTTP Client:** Axios with JWT interceptors
- **Backend:** Node.js Express server (TypeScript, tsx)
- **Database:** Supabase PostgreSQL (via `SUPABASE_DB_URL`)

## Project Structure
- `src/api/` — Axios-based API service modules
- `src/components/ui/` — Reusable Radix UI components
- `src/contexts/` — AuthContext with JWT + permission management
- `src/pages/` — Route-level page components
- `src/hooks/` — Custom hooks
- `src/lib/` — Utilities and query client config
- `server/src/` — Node.js Express backend
  - `server/src/index.ts` — Server entry point (port 8200)
  - `server/src/db.ts` — PostgreSQL pool (Supabase connection)
  - `server/src/routes/` — API route handlers (auth, admin, adminUsers, dashboard, events, faqs, news, teams, testimonials, siteConfiguration, formSubmission, adminFormSubmission, moduleAccessPermission, transactionHistory, accountHistory, finance, adminGroups, publicGroups, adminRecommendations, adminPendingGrants, adminOtherAssets, campaign)
    - `adminUsers.ts` — Full user CRUD: paginated list (GET /), by-token (GET /by-token), dropdown (GET /dropdown), admin-users-dropdown (GET /admin-users-dropdown), get-all-admin-users (GET /get-all-admin-users), export to Excel (GET /export), account balance update (PUT /account-balance), delete with cascade soft-delete (DELETE /:id), restore soft-deleted users (PUT /restore), admin user CRUD (GET/POST /admin-users), user profile update (PUT /), settings toggle (PATCH /:id/settings)
    - `auth.ts` — Auth endpoints including assign-group-admin (PUT /assign-group-admin) toggle and loginAdminToUser (POST /loginAdminToUser) impersonation
    - `adminRecommendations.ts` — Recommendations admin: paginated list with stats (GET /), status update with balance revert on rejection (PUT /:id), hard delete (DELETE /:id), restore soft-deleted (PUT /restore), Excel export (GET /export)
    - `adminPendingGrants.ts` — Pending grants admin: paginated list with day count (GET /), status transitions with balance/fee logic (PUT /:id), notes history (GET /:id/notes), DAF providers list (GET /daf-providers), hard delete with cascade (DELETE /:id), restore with cascade (PUT /restore), Excel export (GET /export)
    - `adminOtherAssets.ts` — Other assets admin: paginated list (GET /), status transitions with balance updates (PUT /:id/status), notes history (GET /:id/notes), hard delete with cascade (DELETE /:id), restore with cascade (PUT /restore), Excel export (GET /export)
    - `adminEmailTemplates.ts` — Email template admin: paginated list with search/sort/filter (GET /), detail (GET /:id), preview (GET /preview/:id), HTML source (GET /html/:id), duplicate (GET /duplicate/:id), categories list (GET /categories), create/update with active-per-category validation and variable extraction (POST /), hard delete (DELETE /:id), restore soft-deleted (PUT /restore)
    - `adminDisbursalRequests.ts` — Disbursal request admin: paginated list with search/sort/status/soft-delete filter (GET /), detail with investment type resolution (GET /:id), Excel export (GET /export), notes history (GET /:id/notes), status update (PUT /:id/status), add note (POST /:id/notes), soft-delete (DELETE /:id), restore (PUT /restore)
    - `adminInvestment.ts` — Full investment CRUD: paginated list with search/stage/status/soft-delete filters (GET /), detail with balance/notes/tags (GET /:id), create with file uploads and anonymous user registration (POST /), update with slug management, tag mappings, audit notes, mention emails (PUT /:id), soft-delete with cascade (DELETE /:id), restore (PUT /restore), clone (POST /:id/clone), status toggle with email notification (PUT /:id/status), notes (GET /:id/notes), notes export (GET /:id/notes/export), recommendations export (GET /:id/recommendations/export), full export to Excel (GET /export), metadata (GET /data), countries (GET /countries), document URL (GET /document), investment types (GET /types), investment names (GET /names), investment requests list (GET /request), investment request detail (GET /request/:id)
    - `campaign.ts` — Campaign investment name list (GET /get-all-investment-name-list) with stage-based filtering; public disbursal endpoints: user-disbursal-investments (GET /user-disbursal-investments), save-disbursal with base64 PDF upload and email notification (POST /save-disbursal), get-disbursal-request (GET /get-disbursal-request), get-disbursal-request-list (GET /get-disbursal-request-list), export-disbursal-request-list (GET /export-disbursal-request-list), get-disbursal-request-notes (GET /get-disbursal-request-notes); QR code email (GET /send-investment-qr-code-email), investment notes export (GET /export-investment-notes), investment notes list (GET /get-investments-notes); raise money form (POST /raisemoney) with hCaptcha, anonymous user registration, file uploads, tag mappings, and 3 notification emails (categories 23, 21, 16); multi-step investment request (POST /investment-request) with anonymous user registration and file uploads
  - `server/src/middleware/` — JWT auth and API access token middleware
  - `server/src/utils/` — JWT, ASP.NET Identity password hashing, 2FA, soft delete, anonymous user registration, Supabase Storage Base64 image upload utilities
    - `uploadBase64Image.ts` — `uploadBase64Image(base64, folder)` uploads to Supabase Storage; `resolveFileUrl(path, defaultFolder)` resolves DB paths to public URLs (always pass defaultFolder); `ensureFolderPrefix(path, folder)` ensures folder prefix on bare filenames; `extractStoragePath(value)` extracts storage path from URLs/paths
  - Startup migration `fixBareFilenamePaths()` in index.ts auto-fixes bare filenames across all file-bearing tables on boot
  - **Supabase Storage folders** (bucket: `production`): campaigns, catacap-teams, disbursal-requests, events, groups, investment-requests, news, site-configurations, themes, users
- `attached_assets/` — Project assets (aliased as `@assets`)
- `scripts/post-merge.sh` — Post-merge setup script (pnpm install)

## Environment Variables
- `VITE_API_BASE_URL` — Backend API base URL (used in production)
- `VITE_SUPABASE_URL` — Supabase project URL for frontend image URL resolution (matches `SUPABASE_URL`)
- `VITE_SUPABASE_STORAGE_BUCKET` — Supabase Storage bucket name for frontend image URL resolution (matches `SUPABASE_STORAGE_BUCKET`)
- `VITE_API_ACCESS_TOKEN` — API access token (shared between frontend and backend)
- `VITE_FRONTEND_URL` — Frontend public URL
- `SUPABASE_DB_URL` — Supabase PostgreSQL connection string (backend)
- `SUPABASE_URL` — Supabase project URL, e.g. `https://<project-ref>.supabase.co` (backend, used for Storage API)
- `SUPABASE_KEY` — Supabase service role key for Storage uploads (backend)
- `SUPABASE_STORAGE_BUCKET` — Supabase Storage bucket name (backend)
- `JWT_SECRET` — Secret key for JWT token signing (backend)
- `CAPTCHA_SECRET_KEY` — hCaptcha secret key for form submission verification (backend)

## Workflow
- **Start application:** `pnpm run dev` — runs both Express server (port 8200) and Vite dev server (port 5000)

## API Architecture
- Vite dev server proxies `/api` requests to the Express backend on port 8200
- Auth: ASP.NET Identity V3 password hashing + JWT tokens + optional 2FA
- All `/api/admin/*` routes require JWT authentication
- All `/api` routes require `Api-Access-Token` header

## Deployment
- **Target:** Static site
- **Build command:** `pnpm run build`
- **Output directory:** `dist`
- For production, CORS or a reverse proxy is needed since Vite proxy only works in dev mode

## Replit Setup Notes
- Vite configured for `host: "0.0.0.0"`, `port: 5000`, `allowedHosts: true` to work behind Replit's proxy
- The axios base URL is set to `""` (empty) so all API calls go through the Vite proxy in dev
- Post-merge script configured at `scripts/post-merge.sh` for automatic dependency installation after task merges

## Role
You are a senior software engineer working with Node.js (Express), React (Vite), .NET, Supabase, and Azure.

## Rules
- Always analyze .NET backend first
- Maintain feature parity
- Do NOT introduce new logic
- Follow existing API structure, business logic, validation, and data flow
- Use @schema.sql for database mapping (snake_case)

## Architecture
- Use modular structure (controller, service, etc.)
- Keep code production-ready

## Database
- Map MSSQL → PostgreSQL (Supabase)
- Follow snake_case naming

## Verification
- Test APIs using provided credentials
- Ensure responses match .NET backend

## Communication
- First explain approach
- Then implement
- Provide verification steps
