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
  - `server/src/routes/` — API route handlers (auth, admin, adminUsers, dashboard, events, faqs, news, teams, testimonials, siteConfiguration, formSubmission, adminFormSubmission, moduleAccessPermission)
  - `server/src/middleware/` — JWT auth and API access token middleware
  - `server/src/utils/` — JWT, ASP.NET Identity password hashing, 2FA, soft delete utilities
- `attached_assets/` — Project assets (aliased as `@assets`)
- `scripts/post-merge.sh` — Post-merge setup script (pnpm install)

## Environment Variables
- `VITE_API_BASE_URL` — Backend API base URL (used in production)
- `VITE_API_IMAGE_CONTAINER` — Azure blob storage container name
- `VITE_API_ACCESS_TOKEN` — API access token (shared between frontend and backend)
- `VITE_FRONTEND_URL` — Frontend public URL
- `SUPABASE_DB_URL` — Supabase PostgreSQL connection string (backend)
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
