# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**開発ルールの正本は [docs/AI_RULES.md](./docs/AI_RULES.md)。必ず従うこと。** 実装フロー（要件整理 → 現状分析 → 方針提案 → 実装 → 自己レビュー → 検証 → 報告）と完了条件（Definition of Done）もそこに定義されている。

## Commands

```bash
npm run dev      # Start dev server (Vite)
npm run build    # Production build — 変更完了の必須ゲート
npm run preview  # Preview production build
```

No test runner or linter is configured. `npm run build` success is the build gate.

## Environment Setup

Copy `.env.example` to `.env` and fill in:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VAPID_PUBLIC_KEY=       # Required for push notifications
VITE_GOOGLE_MAPS_API_KEY=    # Required for PlacesPage map features
```

## Architecture

**Stack:** React 19 (JavaScript/JSX — NOT TypeScript) + Vite PWA + Supabase (auth, database, realtime, storage, edge functions)

**Auth flow:** Google OAuth via Supabase. `AuthContext` (`src/contexts/AuthContext.jsx`) holds `user` (Supabase auth), `familyMember` (joined `family_members` row with family data), and auth/family actions. Every protected page reads from `useAuth()`. This is the only global state — do not add more contexts or state libraries without approval.

**Family model:** A user belongs to at most one family (`unique(user_id)` on `family_members`). The Supabase RLS helper `get_my_family_id()` (defined in `002_rls_policies.sql`) gates all data access — every table's RLS policy uses it, so queries automatically scope to the user's family. Still write explicit `family_id` filters in app code.

**Routing:** `App.jsx` defines all routes. Protected routes wrap with `<ProtectedRoute>`. Public routes: `/` and `/join/:familyId` (invite link). Full route/feature list: [docs/FEATURES.md](./docs/FEATURES.md).

**Data pattern:** initial fetch by `family_id` → realtime subscription (`supabase.channel().on('postgres_changes', …)`, callback re-fetches) → optimistic UI updates with rollback on error. Reference implementation: `src/pages/ShoppingPage.jsx`. Patterns: [docs/API.md](./docs/API.md).

**PWA / Push:** `vite-plugin-pwa` generates the service worker; custom push handler at `public/sw-push.js` (injected via workbox `importScripts`). Subscription management in `src/lib/pushNotifications.js`, stored in `push_subscriptions`.

**Styling:** CSS Modules per page/component + design tokens ("灯 Akari" system) in `src/index.css`. Never hardcode colors/shadows/radii — use `var(--token)`. Dark mode is automatic via tokens. Rules: [docs/DESIGN.md](./docs/DESIGN.md).

## Database Migrations

Migrations in `supabase/migrations/` (3-digit sequential, append-only, never edit applied files) must be applied manually via the Supabase dashboard or `supabase db push`. New tables require `family_id` FK + RLS policy using `get_my_family_id()` in the same file (template in [docs/DATABASE.md](./docs/DATABASE.md)). **Always state required migrations in your completion report.**

Known gap: `wish_places`, `budget_categories`, `budget_entries` are used by code but have no CREATE TABLE migration in the repo (created directly in the dashboard).

## Documentation Map

| Doc | Content |
|---|---|
| [docs/AI_RULES.md](./docs/AI_RULES.md) | **Rules, dev flow, Definition of Done (mandatory)** |
| [docs/PROJECT.md](./docs/PROJECT.md) | Purpose, priorities, dev policy |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System diagrams, data flow |
| [docs/FEATURES.md](./docs/FEATURES.md) | Feature list, new-feature checklist |
| [docs/DATABASE.md](./docs/DATABASE.md) | Tables, RLS, migration rules |
| [docs/API.md](./docs/API.md) | Supabase query patterns, Edge Functions |
| [docs/DESIGN.md](./docs/DESIGN.md) | Akari design system |
| [docs/COMPONENTS.md](./docs/COMPONENTS.md) | Component design, directory layout |
| [docs/STYLE_GUIDE.md](./docs/STYLE_GUIDE.md) | Naming, coding conventions |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Branch/commit/PR/release rules |

Update the relevant doc (FEATURES, DATABASE, COMPONENTS, CHANGELOG) whenever a change makes it stale.
