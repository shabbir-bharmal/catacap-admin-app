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
- **Date Formatting:** dayjs (shared helpers in `src/helpers/format.ts`)
- **HTTP Client:** Axios with JWT interceptors
- **Rich Text Editor:** Quill 2.0.3 + quill-mention 6.1.1 (custom `RichTextEditor` component in `src/components/RichTextEditor.tsx`; styles imported globally in `src/main.tsx`; the `Mention` module is registered explicitly in the component because the bare `quill-mention` import is class-only)
- **Backend:** Node.js Express server (TypeScript, tsx)
- **Database:** Supabase PostgreSQL (via `SUPABASE_DB_URL`)

## Project Structure
- `src/api/` — Axios-based API service modules
- `src/components/ui/` — Reusable Radix UI components
- `src/contexts/` — AuthContext with JWT + permission management
- `src/pages/` — Route-level page components
- `src/hooks/` — Custom hooks
- `src/helpers/format.ts` — Shared formatting utilities (currency, dates)
- `src/lib/` — Utilities and query client config
- `server/src/` — Node.js Express backend
  - `server/src/index.ts` — Server entry point (port 8200)
  - `server/src/db.ts` — PostgreSQL pool (Supabase connection), with pg type parser overrides for timestamp OIDs (1114, 1184) to return raw strings instead of JS Date objects (prevents UTC timezone shift)
  - `server/src/routes/` — API route handlers (auth, admin, adminUsers, dashboard, events, faqs, news, teams, testimonials, siteConfiguration, formSubmission, adminFormSubmission, moduleAccessPermission, transactionHistory, accountHistory, finance, adminGroups, publicGroups, adminRecommendations, adminPendingGrants, adminOtherAssets, campaign)
    - `adminUsers.ts` — Full user CRUD: paginated list (GET /), by-token (GET /by-token), dropdown (GET /dropdown), admin-users-dropdown (GET /admin-users-dropdown), get-all-admin-users (GET /get-all-admin-users), export to Excel (GET /export), account balance update (PUT /account-balance), delete with cascade soft-delete (DELETE /:id), restore soft-deleted users (PUT /restore), admin user CRUD (GET/POST /admin-users), user profile update (PUT /), settings toggle (PATCH /:id/settings)
    - `auth.ts` — Auth endpoints including assign-group-admin (PUT /assign-group-admin) toggle and loginAdminToUser (POST /loginAdminToUser) impersonation
    - `adminRecommendations.ts` — Recommendations admin: paginated list with stats (GET /), status update with balance revert on rejection (PUT /:id), soft delete (DELETE /:id), restore soft-deleted (PUT /restore), Excel export (GET /export)
    - `adminPendingGrants.ts` — Pending grants admin: paginated list with day count (GET /), status transitions with balance/fee logic (PUT /:id), notes history (GET /:id/notes), soft delete with cascade to related tables (DELETE /:id), restore with cascade (PUT /restore), Excel export (GET /export). DAF providers list is owned by `siteConfiguration.ts` (GET /api/admin/site-configuration/daf-providers).
    - `adminOtherAssets.ts` — Other assets admin: paginated list (GET /), status transitions with balance updates (PUT /:id/status), notes history (GET /:id/notes), soft delete with cascade to balance change logs (DELETE /:id), restore with cascade (PUT /restore), Excel export (GET /export)
    - `adminEmailTemplates.ts` — Email template admin: paginated list with search/sort/filter (GET /), detail (GET /:id), preview (GET /preview/:id), HTML source (GET /html/:id), duplicate (GET /duplicate/:id), categories list (GET /categories), create/update with active-per-category validation and variable extraction (POST /), hard delete (DELETE /:id), restore soft-deleted (PUT /restore)
    - `adminDisbursalRequests.ts` — Disbursal request admin: paginated list with search/sort/status/soft-delete filter (GET /), detail with investment type resolution (GET /:id), Excel export (GET /export), notes history (GET /:id/notes), status update (PUT /:id/status), add note (POST /:id/notes), soft-delete (DELETE /:id), restore (PUT /restore)
    - `adminInvestment.ts` — Full investment CRUD: paginated list with search/stage/status/soft-delete filters (GET /), detail with balance/notes/tags (GET /:id), create with file uploads and anonymous user registration (POST /), update with slug management, tag mappings, audit notes, mention emails (PUT /:id), soft-delete with cascade (DELETE /:id), restore (PUT /restore), clone (POST /:id/clone), status toggle with email notification (PUT /:id/status), notes (GET /:id/notes), notes export (GET /:id/notes/export), recommendations export (GET /:id/recommendations/export), full export to Excel (GET /export), metadata (GET /data), countries (GET /countries), document URL (GET /document), investment types (GET /types), investment names (GET /names), investment requests list (GET /request), investment request detail (GET /request/:id)
    - `dashboard.ts` — Dashboard endpoints: summary stats (GET /summary), investment chart (GET /investment-chart), investment by theme (GET /investment-by-theme), recent investments (GET /recent-investments), top donors (GET /top-donors), top groups (GET /top-groups), audit logs (GET /audit-logs), user full data lookup (GET /user-full-data). All dashboard queries exclude soft-deleted records. Growth percentages use total-vs-last-month formula matching .NET. Date/time uses server-local time matching .NET DateTime.Now.
    - `adminScheduler.ts` — Scheduler admin: list configs (GET /), update schedule (PUT /:jobName), trigger job (POST /:jobName/trigger), fetch logs (GET /logs)
    - `analytics.ts` — GA4 analytics dashboard endpoint (GET /). Mounted at both `/api/admin/analytics` and `/api/analytics` behind JWT admin auth. Returns `{ configured: false, missing }` when GA4 secrets are absent; otherwise returns metrics, daily time series, and funnel step counts via `services/ga4Service.ts` with a 60s in-memory cache. GA4 secrets (`GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL`, `GA4_PRIVATE_KEY`, `GA4_PROJECT_ID`) live only on the backend; funnel event names are configured in code via `FUNNEL_EVENT_NAMES`.
    - `campaign.ts` — Campaign investment name list (GET /get-all-investment-name-list) with stage-based filtering; public disbursal endpoints: user-disbursal-investments (GET /user-disbursal-investments), save-disbursal with base64 PDF upload and email notification (POST /save-disbursal), get-disbursal-request (GET /get-disbursal-request), get-disbursal-request-list (GET /get-disbursal-request-list), export-disbursal-request-list (GET /export-disbursal-request-list), get-disbursal-request-notes (GET /get-disbursal-request-notes); QR code email (GET /send-investment-qr-code-email), investment notes export (GET /export-investment-notes), investment notes list (GET /get-investments-notes); raise money form (POST /raisemoney) with hCaptcha, anonymous user registration, file uploads, tag mappings, and 3 notification emails (categories 23, 21, 16); multi-step investment request (POST /investment-request) with anonymous user registration and file uploads
  - `server/src/scheduler/` — Scheduled jobs (node-cron), DB-configurable schedules
    - `index.ts` — Scheduler initialization, reads schedules from `scheduler_configurations` table, supports runtime reload via `reloadScheduler()`
    - `migration-scheduler-configurations.sql` — Standalone migration script for `scheduler_configurations` table with seed data
    - `emailQueue.ts` — In-memory async email queue (producer/consumer pattern)
    - `sendReminderEmail.ts` — SendReminderEmail job (daily 8 AM ET): queries pending grants 3/14 days old, sends DAF/Foundation reminder emails
    - `dailyCleanup.ts` — DeleteArchivedUsers job (daily 2 AM ET): archives and deletes soft-deleted records past retention period. Includes per-step error logging (runStep wrapper), pre-flight diagnostics, FK resolution for campaigns.user_id and group_account_balances.user_id, and skips NOT NULL columns without FK constraints (module_access_permissions.updated_by, return_masters.created_by, completed_investment_details.created_by)
    - `deleteTestUsers.ts` — DeleteTestUsers job (daily 6 PM IST): finds and purges test users and all related data
    - `weeklyKenStats.ts` — WeeklyKenStats job (Friday noon PT): emails ken@catacap.org a HTML stats summary for the past 7 days (new pending grants count+sum, current open pending grants, donations split by Credit Card vs ACH, new approved investments, distributions count+sum with per-campaign breakdown). Sends via Resend directly (no template), respects TEST_EMAIL_OVERRIDE. Scheduler index.ts uses `WEEKLY_JOBS` map (job_name → day-of-week 0-6) so cron expression becomes `M H * * 5` for this job. Manual test runner at `server/src/scripts/sendWeeklyKenStatsTest.ts` (`npx tsx server/src/scripts/sendWeeklyKenStatsTest.ts`).
    - `reference/` — Original .NET stored procedure SQL files for cross-reference
  - `server/src/middleware/` — JWT auth middleware
  - `server/src/utils/` — JWT, ASP.NET Identity password hashing, 2FA, soft delete, anonymous user registration, Supabase Storage Base64 image upload utilities
    - `uploadBase64Image.ts` — `uploadBase64Image(base64, folder)` uploads to Supabase Storage; `resolveFileUrl(path, defaultFolder)` resolves DB paths to public URLs (always pass defaultFolder); `ensureFolderPrefix(path, folder)` ensures folder prefix on bare filenames; `extractStoragePath(value)` extracts storage path from URLs/paths
  - **Supabase Storage folders** (bucket: `production`): campaigns, catacap-teams, disbursal-requests, events, groups, investment-requests, news, site-configurations, themes, users
- `attached_assets/` — Project assets (aliased as `@assets`)
- `scripts/post-merge.sh` — Post-merge setup script (pnpm install)

## Environment Variables
- `VITE_API_BASE_URL` — Backend API base URL (used in production)
- `VITE_SUPABASE_URL` — Supabase project URL for frontend image URL resolution (matches `SUPABASE_URL`)
- `VITE_SUPABASE_STORAGE_BUCKET` — Supabase Storage bucket name for frontend image URL resolution (matches `SUPABASE_STORAGE_BUCKET`)
- `VITE_FRONTEND_URL` — Frontend public URL
- `SUPABASE_DB_URL` — Supabase PostgreSQL connection string (backend)
- `SUPABASE_URL` — Supabase project URL, e.g. `https://<project-ref>.supabase.co` (backend, used for Storage API)
- `SUPABASE_KEY` — Supabase service role key for Storage uploads (backend)
- `SUPABASE_STORAGE_BUCKET` — Supabase Storage bucket name (backend, used for public app assets)
- `SUPABASE_BACKUP_BUCKET` — Dedicated PRIVATE Supabase Storage bucket name for `BackupDatabase` scheduler artifacts (must NOT equal `SUPABASE_STORAGE_BUCKET`; backend refuses to upload backups otherwise)
- `PG_DUMP_PATH` (optional) — Absolute path to a `pg_dump` binary whose major version matches the Postgres server; if unset, the BackupDatabase job auto-discovers a matching binary on PATH and `/nix/store`
- `JWT_SECRET` — Secret key for JWT token signing (backend)
- `CAPTCHA_SECRET_KEY` — hCaptcha secret key for form submission verification (backend)

## Workflow
- **Start application:** `pnpm run dev` — runs both Express server (port 8200) and Vite dev server (port 5000)

## API Architecture
- Vite dev server proxies `/api` requests to the Express backend on port 8200
- Auth: ASP.NET Identity V3 password hashing + JWT tokens + optional 2FA
- All `/api/admin/*` routes require JWT authentication
- Public `/api` routes (auth, events, site config, forms) require no token

## Deployment
- **Target:** Autoscale (Express serves both API and built frontend)
- **Build command:** `pnpm run build` (Vite builds frontend to `dist/`)
- **Run command:** `pnpm run start` (runs Express server in production mode)
- In production, Express serves the `dist/` static files and handles all `/api` routes on port 5000

## Replit Setup Notes
- Vite configured for `host: "0.0.0.0"`, `port: 5000`, `allowedHosts: true` to work behind Replit's proxy
- The axios base URL is set to `""` (empty) so all API calls go through the Vite proxy in dev
- Post-merge script configured at `scripts/post-merge.sh` for automatic dependency installation after task merges
- **Match grants — per-grant Excel export (May 1, 2026):** `GET /api/admin/matching/:id/export` (in `server/src/routes/adminMatching.ts`) returns a 2-sheet `.xlsx`. Sheet 1 "Summary" lists grant metadata: name, donor, match type, total cap, escrow reserved, total matched so far, remaining available, number of investments matched, total investment amount matched, expiry/retroactive dates, and the eligible-campaigns list. Sheet 2 "Matched Investments" has one row per `campaign_match_grant_activity` row with date, investor, campaign, investment amount (from `recommendations.amount` joined via `triggered_by_recommendation_id`), match amount, statuses, and rec IDs, ending in a bold TOTAL row. Built with `ExcelJS`, sent as a streamed response. Frontend trigger: Download icon button per grant row in `src/pages/AdminMatching.tsx` (`handleExport`), uses `axiosInstance` with `responseType: "blob"`, names the file `MatchGrant_<safeName>_<YYYY-MM-DD>.xlsx`.

- **Match grants — retroactive matching (May 1, 2026):** `campaign_match_grants.retroactive_from` (TIMESTAMP, nullable) lets an admin apply a new or edited match grant to investments already on the books. Set in the GrantFormDialog via the "Apply retroactively" Switch + date picker. After the grant is committed, `runRetroactiveSweep(grantId)` in `server/src/utils/matchingGrants.ts` walks all `recommendations` on the grant's eligible campaigns where `date_created >= retroactive_from`, status is approved/pending, the investor is not the donor, the rec is not itself a match-created rec, and no activity row already exists for `(grant, rec)`. Each qualifying rec is matched via the now-exported `applySingleGrant`. Idempotency is guaranteed by the unique index `campaign_match_grant_activity_grant_rec_uniq (match_grant_id, triggered_by_recommendation_id)` (added in `releases/01_05_2026/migrations/2026_05_01_add_retroactive_from_to_match_grants.sql`); `applySingleGrant` catches PG `23505` as a no-op. Donor row is locked with `FOR UPDATE` during live-wallet matching to prevent concurrent overdraft. The POST/PUT response includes `retroactive: { matched, totalAmount, scanned, skipped }`, surfaced in the toast.

- **`pg_dump` runtime requirement (BackupDatabase scheduler job):** the `BackupDatabase` job in `server/src/scheduler/backupDatabase.ts` shells out to `pg_dump`. The major version of `pg_dump` MUST match the Postgres server's major version (currently 17.x on Supabase) — pg_dump v16 against a v17 server fails with "server version mismatch". The job auto-discovers a matching `pg_dump` by walking `PATH` and `/nix/store/*postgresql-<major>*/bin/pg_dump`; if none is found it throws and logs a Failed scheduler row. Install via the package-management skill: `installSystemDependencies({ packages: ["postgresql_17"] })`. Override path explicitly via the optional `PG_DUMP_PATH` env var.
- **`SUPABASE_BACKUP_KEY` — service-role key for the BackupDatabase job:** the `BackupDatabase` job uses a separate Supabase client built from `SUPABASE_URL` + `SUPABASE_BACKUP_KEY`. This MUST be the Supabase **service-role** secret key (the `sb_secret_...` value from Project Settings → API → Secret keys), NOT the publishable/anon `SUPABASE_KEY` that is shipped to the browser. The publishable key cannot read bucket metadata, upload to a private bucket, prune objects, or sign download URLs without permissive RLS policies — and putting such policies on a backup bucket would defeat its purpose. Hard runtime guards refuse to start the job if `SUPABASE_BACKUP_KEY` is unset or equals `SUPABASE_KEY`. The key is read directly by `getBackupStorageConfig()` in `server/src/scheduler/backupDatabase.ts` and never exposed to the frontend.
- **`SUPABASE_BACKUP_BUCKET` — dedicated PRIVATE bucket for database backups:** the `BackupDatabase` job uploads gzipped pg_dump artifacts (which can contain PII / hashed passwords / secrets) into the configured private bucket organised inside the bucket as `<YYYY-MM-DD>/backup-<YYYY-MM-DD>-<HH-MM>.sql.gz` (UTC) — e.g. inside the `database-backups` bucket: `2026-05-01/backup-2026-05-01-14-30.sql.gz`. The filename embeds the full date so the file is self-describing when downloaded out of context (the date folder is just a grouping convenience). The bucket name is NOT repeated as a key prefix; the stored object key is just the date folder + filename. The `artifactPath` value reported back in scheduler metadata is `<bucket>/<YYYY-MM-DD>/backup-<YYYY-MM-DD>-<HH-MM>.sql.gz` for human-readable display, but the actual storage key (used for `createSignedUrl`) is `<YYYY-MM-DD>/backup-<YYYY-MM-DD>-<HH-MM>.sql.gz`. A new date subfolder is created on the first upload of each UTC day. This MUST be a different, PRIVATE bucket from the public-asset `SUPABASE_STORAGE_BUCKET`. The job has hard runtime guards that refuse to upload if (a) `SUPABASE_BACKUP_BUCKET` is unset, (b) it equals `SUPABASE_STORAGE_BUCKET`, (c) the bucket cannot be verified via Supabase's Admin `getBucket` API, or (d) `getBucket().public === true`. Operational setup: create a private bucket in the Supabase dashboard and set this env var to its name; add storage RLS policies so only the backend key can read/write it. **Retention:** after each successful upload, the job auto-deletes any backup files in date subfolders older than 7 UTC days (constant `RETENTION_DAYS = 7` in `backupDatabase.ts`). The metadata fields `artifactPath`, `storagePath`, `sizeBytes`, `retentionDays`, `prunedFiles`, `prunedFolders`, and `prunedPaths` are stored in `scheduler_logs.metadata` JSONB on the upload row and surfaced in the Schedulers tab Details column. `prunedPaths` is the full list of storage keys (e.g. `2026-04-15/backup-2026-04-15-02-00.sql.gz`) that were deleted, so admins can audit exactly which old backups were removed. **Retention log row:** when the prune actually deletes files (or hits warnings), an additional `scheduler_logs` row is inserted with `job_name = 'BackupDatabase'` and `metadata.action = 'retention'` (other metadata: `summary`, `prunedFiles`, `prunedFolders`, `prunedPaths`, `warnings`, `retentionDays`). The Schedulers tab Details column shows the pruned filenames in the cell tooltip (hover the 🗑️ summary). It is rendered in the Schedulers tab Details column with a 🗑️ prefix and a human-readable summary (e.g. *"Deleted 3 backup file(s) older than 7 day(s) from folder(s): 2026-04-15"*); the Download column shows "—" because there is no artifact to download. Status is `Success` if files were deleted (warnings shown alongside, if any) and `Failed` if the prune produced warnings without deleting anything. No retention row is inserted when the prune ran cleanly with nothing to delete (avoids log noise). **Download:** the Schedulers tab shows a Download button on each successful BackupDatabase log row. It calls `POST /api/admin/scheduler/BackupDatabase/download` (admin JWT-gated) which validates the requested path against a strict regex (`<YYYY-MM-DD>/backup-<YYYY-MM-DD>-<HH-MM>.sql.gz`, with backwards-compat for two legacy formats: `<YYYY-MM-DD>/backup-<HH-MM>.sql.gz` and `database-backups/<YYYY-MM-DD>/backup-<HH-MM>.sql.gz` — so older log rows remain clickable), re-asserts the bucket is private, and returns a Supabase Storage signed URL valid for 5 minutes. The browser opens the signed URL in a new tab to start the download.

## Role
You are a senior software engineer working with Node.js (Express), React (Vite), .NET, Supabase, and Azure.

## Rules
- Always analyze .NET backend first
- Maintain feature parity
- Do NOT introduce new logic
- Follow existing API structure, business logic, validation, and data flow
- Use @schema.sql for database mapping (snake_case)
- The `/Back-End` folder contains .NET reference code only and must NOT be modified; all code changes must be made only in the Node.js (`server/`) and React (`src/`) code
- Any database schema or data change executed via direct `pool` calls (e.g. `pool.query`, `client.query`, runtime `ensure*` helpers in `server/src/db.ts`, ad-hoc one-off scripts) must FIRST be written as a SQL migration file under `releases/<DD_MM_YYYY>/migrations/` and documented in that release's `docs.txt` (schema, intent, idempotency, rollback). Migrations must be idempotent (`IF NOT EXISTS`, guarded `DO` blocks, etc.) and wrapped in a transaction. Do not apply schema/data changes that exist only in code or only in the live database — the migration file is the source of truth and must land in the same change set.

## Recent changes
- **Investments / Other Assets / Dashboard polish** (May 2026) — (a) The CataCap-funding $ button on `/investments` no longer opens a small inline Dialog; it now routes to the standalone `/investments/:id/investors` page (same target as the existing investor-count button), giving a unified layout with Method/Status/Date/projected matches. Removed the inline Dialog, its drilldown state (`investorsTarget`/`investorsData`/`investorsLoading`/`investorsError`), the `handleOpenInvestors` helper, and the now-unused `Dialog/DialogContent/...` + `fetchInvestmentInvestors`/`InvestmentInvestorsResponse` imports from `src/pages/Investments.tsx`. (b) `ConfirmationDialog` gained an optional `contentClassName` prop merged via `cn("sm:w-[480px]", contentClassName)`; the four asset-note dialogs in `src/pages/OtherAssets.tsx` (reject, transit, received, follow-up) now pass `sm:max-w-[640px] sm:w-[640px]` so attachment filenames have room to display without aggressive truncation. (c) Dashboard "Investment by Theme" progress-bar track changed from `bg-muted` (which appeared transparent on the muted card surface) to `bg-white border border-border overflow-hidden` so the track is visibly white behind the colored fill. (d) Fixed user-visible typo "Auto-enrol" → "Auto-enroll" on the Admin Settings tab of `AdminInvestmentEdit.tsx` (also corrected the two adjacent code comments for consistency).
- **Investor payment-method column** (May 2026) — On `/investments/:id/investors` the table now includes a "Method" column showing how each contribution was funded: Wallet (slate, direct funding via cash/CC/ACH/account balance), DAF (sky-blue, donor-advised fund — provider shown inline e.g. "DAF · Fidelity Charitable", fund name in tooltip), Foundation (indigo, foundation grants), or Match Grant (violet). Combined with the existing Status badge, pending DAF/foundation grants are visually unmistakable. Classification is in `unifiedInvestorsCTE` (`server/src/routes/adminInvestment.ts`): the recommendation branch maps `pending_grants_id IS NULL → 'wallet'`, otherwise foundation-vs-DAF is decided by the sentinel `LOWER(TRIM(pg.daf_provider)) = 'foundation grant'`; the orphan-pending-grants branch uses the same sentinel. Match-grant rows (recs with no `pending_grants_id` but populated `matchInfo.asMatch[id]`) are re-labeled `wallet → match` in the JS layer because they're funded from grant escrow, not the donor's wallet. The Excel export gained a "Method" column at index 4 (all subsequent column numFmts/widths/totals shifted by +1). Verified: camp 13 = 14/14 wallet; camp 23 = 15 wallet + 1 DAF received + 1 DAF pending (orphan); camp 44 = 41 wallet + 6 DAF + 1 foundation.
- **Investment update email recipients** (May 2026) — Fixed silent under-delivery of investment update emails. Previously, `/api/admin/investment/:id/updates` POST fan-out, `/email-preview`, `/send-email`, and the `campaignUpdateNotifications` scheduler all derived recipients via `user_investments JOIN recommendations`, which silently excluded approved-recommendation investors whose money had not yet landed (no `user_investments` row). Example: campaign 13 (Biotic Ferments) showed 9 investors on the Investors tab but only 5 received the update. New helper `server/src/utils/campaignUpdateRecipients.ts` exports three SQL constants (USERS_SQL, USER_IDS_SQL, COUNT_SQL) — all keyed by `$1=campaignId` — that mirror `unifiedInvestorsCTE`: UNION of (a) recommendations with status approved/pending and amount>0 and no rejected linked pending_grant, (b) orphan pending_grants with status pending and amount>0, and (c) asset_based_payment_requests in transit. Final filter requires deliverable email and not opted out. Applied at all four sites; verified `/email-preview` for camp 13 now returns `recipientCount: 9`.
- **Pending match projection** (May 2026) — Pending recommendations and pending DAFs that will trigger match grants when they land are now surfaced read-only across the admin UI. Helper at `server/src/utils/pendingMatches.ts` (`projectPendingMatchesForCampaign`, `projectPendingMatchesForGrant`, `projectPendingTotalsForAllGrants`) mirrors the live `applySingleGrant` algorithm (capped/full, per-investment cap, donor≠trigger, expiry, escrow remaining, donor wallet balance for unlimited grants). Surfaced in:
  - `/api/admin/investment/:id/investors` — appends `projected_match` rows (negative synthetic sourceId, status=pending) and adds `pending: true`-flagged entries to the trigger investor's `triggeredMatches`. Adds `pendingMatchAmount` and `pendingMatchCount` to the response. Totals (amount/contributions/distinct investors) include projections.
  - `/api/admin/investment/:id/investors/export` — Excel includes projected rows as “Projected match from <grant> for <trigger>’s $X”; summary line calls out pending totals.
  - `/api/admin/matching` — each grant gets `pendingAmount` + `pendingCount`.
  - `/api/admin/matching/:id/activity` — returns `pendingItems` and `pendingTotal` alongside actual `items`.
  Frontend: amber pending badges on `InvestmentInvestors` (replaces single-badge MatchAnnotation with a multi-badge layout that splits actual vs pending triggered matches), amber projected rows highlighted; `AdminMatching` grant card shows pending stat in header and the activity panel renders a separate amber Pending section below actual activity.

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

## Domain Notes

### Investment Instruments (campaigns lookup field)
- **Source of truth**: `campaigns.investment_instruments` (TEXT, comma-separated lookup IDs) resolved against the `investment_instruments` lookup table.
- **Canonical user-facing label**: "Investment Instruments" (singular: "Investment Instrument"). Older labels like "Type of Investment", "Investment Type", "Investment Types" referring to this field have been retired across all UI strings, validation/error messages, table column headers, view-detail labels, and Excel export headers.
- **Do NOT confuse with**: `campaigns.investment_type_category` (Equity / Debt / Hybrid). That field is rendered in `AdminInvestmentEdit.tsx` Step 4 under the heading "Investment Type" and is intentionally a different concept; its label and Excel export header are kept as "Investment Type".
- **Read/write paths** (all use `campaigns.investment_instruments` consistently):
  - Admin GET single: `server/src/routes/adminInvestment.ts` exposes `investmentTypes: c.investment_instruments`.
  - Admin save: `server/src/routes/adminInvestment.ts` writes `campaign.investmentTypes ?? existing.investment_instruments` back to the same column.
  - Disbursal endpoints (`server/src/routes/campaign.ts`, `server/src/routes/adminDisbursalRequests.ts`) join `campaigns` and resolve names via `buildInvestmentTypeMap` / `resolveInvestmentTypeString`.
- **History note (campaign id=229 investigation, task #347)**: The original .NET seed in `Back-End/Invest.Repo/Data/InvestmentTypeData.cs` only contained ids 1–11, ending with "Real Estate" (id=11). Ids 12+ ("Convertible Note", "Equity Fund", "SAFE", "Preferred Stock") were added on production after the seed. Campaign 229 currently stores `investment_instruments = "12"` which correctly resolves to "Convertible Note" — this matches the admin edit page. If a separate public-facing site (catacap.org) renders a different value, the divergence is in that site's own data path, not in this admin codebase.

### Investment Owner field (Admin Settings tab on `/raisemoney/edit/:id`)
- **UI control**: `UserEmailCombobox` (`src/components/UserEmailCombobox.tsx`) — typeahead Popover + cmdk that only allows selecting an email belonging to a real, non-deleted row in `users`. Free-text values are validated and rejected with the message "User with such email address does not exist".
- **Backend lookups** (in `server/src/routes/adminUsers.ts`, mounted at `/api/admin/user`):
  - `GET /email-search?q=<substr>&limit=<n>` — substring match on `users.email` (LOWER LIKE), case-insensitive, prioritises exact then prefix matches, returns up to 50.
  - `GET /email-lookup?email=<exact>` — exact case-insensitive match, used to validate a stored value on form load and to decide whether to show the validation error.
- **Storage**: this field still maps to `campaigns.contact_info_email_address` (no schema change). Validation is purely UI-side; the back-end save endpoint does not enforce that the email matches a real user (yet). If we ever want to also auto-update `campaigns.user_id` from this email, that would be a follow-up change.
- **Save guard**: `validate()` in `AdminInvestmentEdit.tsx` blocks Save and shows a destructive toast when `investmentOwnerValid` is false.

### Owner column on `/investments`
- Server query (`server/src/routes/adminInvestment.ts` ~line 1260) `LEFT JOIN users ou ON c.user_id = ou.id` and selects `c.contact_info_email_address` as a fallback for the displayed `ownerEmail`. Mirrors the existing fallback in the `resolveInvestmentOwnerEmail` helper.
- Frontend (`src/pages/Investments.tsx`) renders the Owner cell when EITHER `ownerFullName` OR `ownerEmail` is present, so campaigns with no linked user but a contact email still surface that email.
