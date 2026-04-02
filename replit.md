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

## Project Structure
- `src/api/` — Axios-based API service modules
- `src/components/ui/` — Reusable Radix UI components
- `src/contexts/` — AuthContext with JWT + permission management
- `src/pages/` — Route-level page components
- `src/hooks/` — Custom hooks
- `src/lib/` — Utilities and query client config
- `attached_assets/` — Project assets (aliased as `@assets`)
- `server/` — Node.js/Express backend
  - `server/src/index.ts` — Express server entry point (port 8200)
  - `server/src/db.ts` — PostgreSQL connection pool
  - `server/src/middleware/apiAccessToken.ts` — API access token validation middleware
  - `server/src/routes/auth.ts` — Auth routes (login, 2FA verification)
  - `server/src/routes/admin.ts` — Admin routes (get user by token)
  - `server/src/utils/aspnetIdentityHash.ts` — ASP.NET Identity PBKDF2 password hash verifier
  - `server/src/utils/jwt.ts` — JWT token generation and verification
  - `server/src/routes/dashboard.ts` — Dashboard routes (summary, charts, tables, audit logs)
  - `server/src/routes/events.ts` — Events CRUD routes (list, get, create/update, soft delete, restore)
  - `server/src/routes/faqs.ts` — FAQs CRUD routes (list, get, summary, create/update, soft delete, restore, reorder)
  - `server/src/routes/news.ts` — News CRUD routes (list with type/audience/theme joins, get, create/update, soft delete, restore)
  - `server/src/routes/teams.ts` — Teams CRUD routes (list, get, create/update, soft delete, restore, reorder)
  - `server/src/routes/testimonials.ts` — Testimonials CRUD routes (list with user join, get, create/update, soft delete, restore)
  - `server/src/routes/siteConfiguration.ts` — Site configuration routes (9 types: themes, sourcedby, special-filters, transaction-type, news-type, news-audience, investment-terms, statistics, meta-information; investment assignments)
  - `server/src/utils/softDelete.ts` — Shared helpers for soft delete filtering, pagination parsing, sort clause building
  - `server/src/utils/twoFactor.ts` — In-memory 2FA code store (placeholder for email)

## Environment Variables
- `VITE_API_BASE_URL` — Backend API base URL
- `VITE_API_IMAGE_CONTAINER` — Azure blob storage container name
- `VITE_API_ACCESS_TOKEN` — API access token
- `VITE_FRONTEND_URL` — Frontend public URL
- `SUPABASE_DB_URL` — Supabase PostgreSQL connection string (used by the backend server)
- `DATABASE_URL` — Replit-managed PostgreSQL (not used by auth server)
- `JWT_SECRET` — Secret key for signing JWT tokens
- `API_ACCESS_TOKEN` — Static API access token validated by backend middleware

## API Endpoints
- `POST /api/userauthentication/admin/login` — Admin login (email/password, returns JWT or 2FA prompt)
- `POST /api/userauthentication/verify-2fa` — 2FA code verification (returns JWT)
- `GET /api/admin/user/by-token` — Get admin user profile by JWT token
- `GET /api/admin/home/summary` — Dashboard summary stats (donations, groups, users, growth %)
- `GET /api/admin/home/investment-chart` — Investment chart data with monthly breakdown
- `GET /api/admin/home/investment-by-theme` — Investment distribution by theme
- `GET /api/admin/home/recent-investments` — Paginated recent investments list
- `GET /api/admin/home/top-donors` — Paginated top donors list
- `GET /api/admin/home/top-groups` — Paginated top groups list
- `GET /api/admin/home/audit-logs` — Paginated audit logs with identifier resolution
- **Content Management (all JWT-protected):**
  - `GET/POST /api/admin/event` — Events list / create-or-update
  - `GET/DELETE /api/admin/event/:id` — Event by ID / soft delete
  - `PUT /api/admin/event/restore` — Restore deleted events
  - `GET/POST /api/admin/faq` — FAQs list / create-or-update
  - `GET /api/admin/faq/summary` — FAQ category summary counts
  - `GET/DELETE /api/admin/faq/:id` — FAQ by ID / soft delete
  - `PUT /api/admin/faq/restore` — Restore deleted FAQs
  - `POST /api/admin/faq/reorder` — Reorder FAQs
  - `GET/POST /api/admin/news` — News list / create-or-update
  - `GET/DELETE /api/admin/news/:id` — News by ID / soft delete
  - `PUT /api/admin/news/restore` — Restore deleted news
  - `GET/POST /api/admin/team` — Teams list / create-or-update
  - `GET/DELETE /api/admin/team/:id` — Team member by ID / soft delete
  - `PUT /api/admin/team/restore` — Restore deleted team members
  - `POST /api/admin/team/reorder` — Reorder team members
  - `GET/POST /api/admin/testimonial` — Testimonials list / create-or-update
  - `GET/DELETE /api/admin/testimonial/:id` — Testimonial by ID / soft delete
  - `PUT /api/admin/testimonial/restore` — Restore deleted testimonials
  - `GET /api/admin/site-configuration/:type` — Site config by type (9 types)
  - `POST /api/admin/site-configuration` — Create or update site config item
  - `DELETE /api/admin/site-configuration/:type/:id` — Delete site config item
  - `GET /api/admin/site-configuration/:type/:id/investments` — Investment assignments
  - `POST /api/admin/site-configuration/:type/:id/investments/:investmentId` — Toggle investment assignment
  - `GET /api/admin/site-configuration/slug/:slug` — Check if slug exists
- `GET /api/health` — Health check (no auth required)

## Workflow
- **Start application:** `pnpm run dev` on port 5000 (webview)

## Deployment
- **Target:** Static site
- **Build command:** `pnpm run build`
- **Output directory:** `dist`

## Replit Setup Notes
- Vite configured for `host: "0.0.0.0"`, `port: 5000`, `allowedHosts: true` to work behind Replit's proxy
- **API Proxy:** Vite dev server proxies `/api` requests to the backend (`VITE_API_BASE_URL`) to avoid CORS issues. The axios base URL is set to `""` (empty) so all API calls go through the proxy.
- For production deployment, a reverse proxy or CORS allowlist on the backend will be needed since the Vite proxy only works in dev mode.
