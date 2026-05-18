# Phase 1 — Foundation Design Spec

**Date:** 2026-05-18  
**Status:** Approved  
**Source:** `docs/phases/phase-1-foundation.md` + user additions in session

---

## Goal

A deployed Next.js 15 app where a user can sign in via Clerk and see an empty `/trips` dashboard. Database connected. CI passes. No trip features yet.

---

## Routing & App Structure

Three route groups in App Router:

- **`(auth)/`** — public. Contains `/sign-in/[[...sign-in]]/page.tsx` and `/sign-up/[[...sign-up]]/page.tsx`. Uses Clerk's pre-built `<SignIn />` / `<SignUp />` components — no custom auth UI.
- **`(app)/`** — Clerk middleware enforces auth on all routes within. Shared layout with top nav (`<UserButton />` + app name). `/trips/page.tsx` is the only route this phase — renders empty state.
- **`app/page.tsx`** — public landing page. Simple hero + one-line description + "Sign in / Sign up" CTAs. Intentional-looking, not generic. (Full polish deferred to Phase 6.)
- **`app/api/clerk/webhook/route.ts`** — Svix-verified Clerk webhook handler.

`middleware.ts` protects everything under `(app)/`. Explicitly public routes: `/`, `/sign-in`, `/sign-up`, `/api/clerk/webhook`.

---

## Authentication (Clerk)

- `<ClerkProvider>` wraps `app/layout.tsx`.
- Sign-in and sign-up pages use Clerk's hosted component UI — no custom forms.
- `<UserButton />` in the protected nav provides profile dropdown and sign-out.
- No custom session management — Clerk handles it entirely.

---

## Database Layer

### Schema

`lib/db/schema.ts` defines `users` only this phase:

```ts
id: uuid (pk, defaultRandom())
clerk_user_id: text (unique, not null, indexed)
email: text (not null)
created_at: timestamptz (not null, defaultNow())
updated_at: timestamptz (not null, defaultNow())
```

### Types

DB types derive from the schema using Drizzle's inference — not hand-written parallel types:

```ts
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

Same "schema is source of truth" principle applied to the DB layer as Zod applies to API/AI layer.

### Migrations

Drizzle generates migrations into `drizzle/`. `npm run db:generate` then `npm run db:migrate` before deploy. Generated files committed. Never edited after applied.

### Repository pattern

`lib/db/repositories/users.ts` — thin, typed functions over Drizzle. No raw Drizzle calls in components, actions, or route handlers. Functions this phase:

- `createUserFromClerk(clerkUserId, email)` — inserts a new User row
- `updateUserEmail(clerkUserId, email)` — updates email on `user.updated`
- `deleteUserByClerkId(clerkUserId)` — hard delete on `user.deleted`
- `getUserByClerkId(clerkUserId)` — lookup by Clerk ID (used by `ensureUserExists`)

---

## Clerk Webhook

`/api/clerk/webhook` verifies the Svix signature with `CLERK_WEBHOOK_SECRET` before processing any payload.

Handles:
- `user.created` → `createUserFromClerk()`
- `user.updated` → `updateUserEmail()` if email changed
- `user.deleted` → `deleteUserByClerkId()`

Returns `400` on signature failure, `200` on success, `400` on unhandled event type (with body `{ ignored: true }`).

---

## Lazy User Creation (Webhook Fallback)

The `(app)/layout.tsx` server component calls `ensureUserExists()` on every protected page load:

```ts
async function ensureUserExists(clerkUserId: string, email: string) {
  const existing = await getUserByClerkId(clerkUserId);
  if (!existing) await createUserFromClerk(clerkUserId, email);
}
```

**Why:** Clerk webhooks can't reach localhost (no ngrok needed for local dev). Also a belt-and-suspenders for production webhook delays or dropped events. The row is idempotent to create — if the webhook already ran, the lookup short-circuits with no DB write.

Called with `auth()` + `currentUser()` from Clerk. Only runs once per session in practice (subsequent requests find the row).

---

## Env Validation

`lib/env.ts` exports a Zod-parsed `env` object. App refuses to boot if any var is missing or malformed.

Phase 1 vars:
```
DATABASE_URL             — Neon pooled connection string
CLERK_SECRET_KEY         — Clerk backend key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — Clerk frontend key
CLERK_WEBHOOK_SECRET     — Svix verification secret
```

Imported at the top of `lib/db/index.ts` so the error surfaces immediately on first use, not silently later.

All vars documented in `.env.example` with placeholder values. `.env.local` is gitignored.

---

## The `/trips` Dashboard

Server component. `auth()` call as belt-and-suspenders (middleware already blocks unauthenticated requests). Renders:

- "No trips yet" empty state message
- Disabled "New trip" button (real action wired in Phase 2)

No data fetching — no trips exist yet.

---

## shadcn/ui

Initialized with Default style, Slate base color, CSS variables on. Components installed this phase only: `button`, `card`, `input`, `label`, `sonner`. No extras.

---

## Acceptance Criteria

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes  
- [ ] `npm run dev` boots without errors; `localhost:3000` shows landing page
- [ ] Signing up creates a User row in Neon (via webhook or lazy creation)
- [ ] Signed-out user visiting `/trips` is redirected to sign-in
- [ ] Signed-in user at `/trips` sees the empty dashboard
- [ ] Deployed to Vercel; all of the above works on the production URL
- [ ] No secrets in the repo; `.env.example` lists all required vars with placeholders

---

## Out of Scope This Phase

Trips, uploads, AI parsing, Inngest, R2, Mapbox, Anthropic API, background jobs. Do not get ahead.
