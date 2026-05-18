# Phase 1 — Foundation

**Goal:** A deployed Next.js app where I can sign in via Clerk and see an empty `/trips` dashboard. Database connected. CI passes. No features yet.

**Out of scope this phase:** Trips, uploads, AI, maps. Don't get ahead.

> **Before executing this phase:** let the Superpowers brainstorming/planning skills do their job. This doc is the spec to refine, not a script to run line-by-line. The step-by-step below is a *starting point* for the planning skill to turn into a concrete task list — adjust based on the current state of the codebase, library versions (verify via Context7), and anything that's drifted since this was written.

## Deliverables

1. Next.js 15 app scaffolded with TypeScript strict mode and Tailwind.
2. shadcn/ui initialized with a small set of base components installed (Button, Card, Input, Label, Sonner toaster). Don't install everything — just what we'll use this phase plus the next.
3. Clerk configured: sign-in page, sign-up page, middleware protecting `/app/(app)/*`, sign-out button in a top nav.
4. Neon database provisioned, connection string in env, Drizzle ORM wired up.
5. Initial schema migrated: `users` table only.
6. Clerk webhook endpoint (`/api/clerk/webhook`) that creates a User row on `user.created`. Includes signature verification.
7. `/trips` route renders an empty state ("No trips yet") with a disabled "New trip" button (the button is real next phase).
8. Env validation (`lib/env.ts`) — Zod schema, throws clear errors if anything missing.
9. Deployed to Vercel. Public URL works. Sign-in works. Empty dashboard renders.
10. README with: what it is, how to run locally, how to deploy. The first version of the README — it'll grow.

## Folder structure to create

```
.
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
├── .env.example
├── .env.local           (gitignored)
├── .gitignore
├── drizzle.config.ts
├── middleware.ts
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   └── phases/
│       ├── phase-1-foundation.md
│       ├── phase-2-uploads.md       (stub, fill in later)
│       ├── phase-3-ai-parsing.md    (stub)
│       ├── phase-4-itinerary.md     (stub)
│       ├── phase-5-maps.md          (stub)
│       └── phase-6-polish.md        (stub)
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     (landing page — simple)
│   ├── globals.css
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx               (protected layout with nav)
│   │   └── trips/
│   │       └── page.tsx             (empty dashboard)
│   └── api/
│       └── clerk/
│           └── webhook/
│               └── route.ts
├── components/
│   └── ui/                          (shadcn lives here)
├── lib/
│   ├── env.ts
│   └── db/
│       ├── index.ts                 (Drizzle client)
│       └── schema.ts                (users table)
└── drizzle/                         (migrations)
```

## Step-by-step

### 1. Scaffold

```bash
npx create-next-app@latest wayfare \
  --typescript --tailwind --eslint --app --src-dir=false \
  --import-alias "@/*" --turbopack
```

Verify `tsconfig.json` has `"strict": true`.

### 2. Install deps

```bash
npm i @clerk/nextjs drizzle-orm @neondatabase/serverless zod svix
npm i -D drizzle-kit @types/node
```

### 3. shadcn/ui

```bash
npx shadcn@latest init
# Choose: Default style, Slate base color, CSS variables yes
npx shadcn@latest add button card input label sonner
```

### 4. Clerk

Sign up at clerk.com, create an application, copy the publishable + secret keys into `.env.local`.

In `middleware.ts`:
- Match all routes except static files and `_next`.
- Protect everything under `app/(app)/`.
- Public routes: `/`, `/sign-in`, `/sign-up`, `/api/clerk/webhook`.

Wrap `app/layout.tsx` with `<ClerkProvider>`.

Build the sign-in and sign-up pages using Clerk's `<SignIn />` and `<SignUp />` components — don't roll our own UI for this. Set up `/sign-in/[[...sign-in]]/page.tsx` and `/sign-up/[[...sign-up]]/page.tsx`.

### 5. Database

Sign up at neon.tech, create a project, copy the pooled connection string into `DATABASE_URL`.

`lib/db/schema.ts`:
```ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`drizzle.config.ts` pointing at `lib/db/schema.ts`, generating into `drizzle/`.

Scripts in `package.json`:
- `"db:generate": "drizzle-kit generate"`
- `"db:migrate": "drizzle-kit migrate"`
- `"db:push": "drizzle-kit push"`
- `"typecheck": "tsc --noEmit"`

Run `db:generate`, then `db:migrate`. Verify in Neon dashboard that `users` table exists.

### 6. Clerk webhook

`app/api/clerk/webhook/route.ts`:
- Verify the Svix signature using `CLERK_WEBHOOK_SECRET` from env.
- On `user.created`: insert into `users`.
- On `user.updated`: update email if it changed.
- On `user.deleted`: delete the row (cascade will clean trips when those exist).

Configure the webhook endpoint in Clerk dashboard pointing at the deployed URL with the three event types subscribed.

### 7. Env validation

`lib/env.ts`:
```ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
});

export const env = envSchema.parse(process.env);
```

Import `env` somewhere that runs at startup so it fails fast on misconfig.

### 8. The protected dashboard

`app/(app)/layout.tsx`:
- Top nav with the app name and a `<UserButton />` (Clerk's profile dropdown).
- Renders children in a centered container.

`app/(app)/trips/page.tsx`:
- Server component.
- Calls `auth()` from Clerk — if no user, redirect (middleware should handle this but belt-and-suspenders).
- Renders "No trips yet. Click 'New trip' to add one." with a disabled button.

### 9. Landing page

`app/page.tsx`:
- A simple, clean marketing-ish page. Hero text, one-line description, "Sign in" and "Sign up" buttons that route to Clerk pages.
- This is what a recruiter sees first. Make it look intentional, not generic. We'll polish in phase 6, but make it not embarrassing now.

### 10. Deploy

- Push to GitHub.
- Import the repo in Vercel.
- Add all env vars in Vercel project settings.
- Deploy. Note the URL.
- Update Clerk dashboard with the production URL (allowed origins, webhook endpoint).
- Sign up, verify a User row appears in Neon, sign in, see the empty dashboard.

### 11. README v1

Sections:
- One-paragraph description (what is Wayfare).
- Tech stack (bullet list).
- Local development (clone, env vars, npm install, db:migrate, npm run dev).
- Deployment (high level — Vercel, env vars, Clerk webhook config).
- Roadmap (link to PRD's "v2" section).

## Acceptance criteria

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run dev` boots without errors and `localhost:3000` shows the landing page.
- [ ] Signing up creates a User row in Neon.
- [ ] Signed-out user visiting `/trips` is redirected to sign-in.
- [ ] Signed-in user at `/trips` sees the empty dashboard.
- [ ] Deployed to Vercel and all the above works on the production URL.
- [ ] No secrets in the repo. `.env.example` lists all required vars with placeholder values.

## What's likely to bite us

- **Clerk webhook in local dev** — webhooks can't reach localhost. Use a tunnel (e.g. `ngrok http 3000`) and configure a dev webhook endpoint in Clerk, or just rely on lazy creation on first sign-in for local testing.
- **Neon scale-to-zero cold starts** — the first query after idle takes 1-2 seconds. Fine for development; the deployed app stays warm enough for demos.
- **App Router route group syntax** — `(auth)` and `(app)` are route groups (don't affect URL paths), they're for organizing layouts. Don't confuse with dynamic routes.

## Definition of done

I push the deploy link to myself, sign up with a new email, see the empty dashboard, and close the laptop satisfied that the foundation is real.

---

> **Next phase (preview, not now):** Trip CRUD + R2 upload pipeline. We'll create/list/view trips, set up Cloudflare R2, and wire up the direct-to-R2 upload flow (without parsing — that's phase 3).
