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

## Environment Variables
- `VITE_API_BASE_URL` — Backend API base URL
- `VITE_API_IMAGE_CONTAINER` — Azure blob storage container name
- `VITE_API_ACCESS_TOKEN` — API access token
- `VITE_FRONTEND_URL` — Frontend public URL

## Workflow
- **Start application:** `pnpm run dev` on port 5000 (webview)

## Deployment
- **Target:** Static site
- **Build command:** `pnpm run build`
- **Output directory:** `dist`

## Replit Setup Notes
- Vite configured for `host: "0.0.0.0"`, `port: 5000`, `allowedHosts: true` to work behind Replit's proxy
