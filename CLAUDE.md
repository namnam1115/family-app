# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Vite)
npm run build    # Production build
npm run preview  # Preview production build
```

No test runner is configured.

## Environment Setup

Copy `.env.example` to `.env` and fill in:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VAPID_PUBLIC_KEY=   # Required for push notifications
```

## Architecture

**Stack:** React 19 + Vite PWA + Supabase (auth, database, realtime)

**Auth flow:** Google OAuth via Supabase. `AuthContext` (`src/contexts/AuthContext.jsx`) holds `user` (Supabase auth), `familyMember` (joined `family_members` row with family data), and auth/family actions. Every protected page reads from `useAuth()`.

**Family model:** A user belongs to at most one family (`unique(user_id)` on `family_members`). The Supabase RLS helper `get_my_family_id()` (defined in `002_rls_policies.sql`) gates all data access — every table's RLS policy uses it, so queries automatically scope to the user's family without explicit filtering in app code.

**Routing:** `App.jsx` defines all routes. Protected routes wrap with `<ProtectedRoute>` which redirects unauthenticated users. `/join/:familyId` is public (invite link entry point).

**Realtime:** `shopping_lists` and `shopping_items` are in the Supabase realtime publication (`003_realtime.sql`). Pages subscribe via `supabase.channel()` to sync across family members live.

**PWA / Push notifications:** `vite-plugin-pwa` generates the service worker. A custom push handler lives at `/sw-push.js` (imported via `workbox.importScripts`). Push subscription management is in `src/lib/pushNotifications.js` — subscriptions are stored in a `push_subscriptions` table.

**Styling:** CSS Modules per component/page (e.g. `ShoppingPage.module.css` alongside `ShoppingPage.jsx`). No global CSS framework.

**Pages (all under `src/pages/`):** HomePage (app launcher + auth), ShoppingPage, PricePage, BudgetPage, PlacesPage, JoinPage.

## Database Migrations

Migrations are in `supabase/migrations/` and must be applied manually via the Supabase dashboard or CLI (`supabase db push`). Run in order: `001_initial_schema.sql` → `002_rls_policies.sql` → `003_realtime.sql`.
