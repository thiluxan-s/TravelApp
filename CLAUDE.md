# Wayfare — Travel Second Brain

> **Read these documents in order before starting any task:**
> 1. This file (project context, conventions, principles)
> 2. `docs/PRD.md` (what we're building and why)
> 3. `docs/ARCHITECTURE.md` (how it fits together)
> 4. `docs/DATA_MODEL.md` (database schema and the reasoning)
> 5. The current phase doc in `docs/phases/` matching what we're working on
>
> If anything in a phase doc contradicts this file, **stop and ask** — don't reconcile silently.

---

## Working with this codebase

When Superpowers skills activate (brainstorming, planning, TDD, debugging, verification), follow them. They are the workflow. This document gives you the *context* those skills consume — not a replacement for them. If the brainstorming skill wants to refine a phase doc into a concrete plan before coding, that's the right move. If TDD activates, write the failing test first. Don't argue with the red-green-refactor cycle.

Use Context7 to pull current docs for any library before writing non-trivial code against it (Drizzle, Clerk, Inngest, Mapbox GL JS, Anthropic SDK, Next.js App Router APIs). Library surfaces drift; training-data knowledge of them does not age well. A quick Context7 lookup is cheaper than a wrong import.

Use the frontend-design skill for any UI component or page work. It encodes design tokens, layout patterns, and aesthetic guardrails that beat what either of us would invent from scratch. Don't reinvent its conventions.

If a plugin skill and this document conflict on *process* (when to test, how to plan, how to debug), the plugin wins. If they conflict on *project context* (what we're building, the tech stack, the conventions, the data model), this document wins — flag the contradiction so we can update whichever is wrong.

## What this is

Wayfare is a portfolio project: a travel "second brain" web app. Users upload booking confirmation PDFs (flights and hotels), the app parses them with an AI vision model into structured data, and renders a unified daily itinerary with a map view and intelligent annotations between events (e.g. "your flight lands 2 hours before hotel check-in opens").

The audience is hiring managers reviewing my portfolio. Every architectural and UX decision should serve the demo: a recruiter should be able to sign in, upload two PDFs, and within a minute see a polished itinerary that looks intelligent.

## Who I am

I'm Thiluxan, a full-stack developer with 3 years on a production React/TypeScript/Vite EMR app (MobX, Zod, AWS Lambda/DynamoDB). I have prior Next.js experience from portfolio work 3-4 years ago. I'm building this with Claude Code on weekends. I value:

- **Minimal targeted changes.** Follow existing patterns. Don't refactor things that aren't part of the task.
- **Understanding the reasoning** behind every change. If you propose something, explain *why* in one sentence so I can learn from it.
- **Running typecheck before committing.** I've been burned by Vite + TS pipelines passing locally and failing in CI.

## Tech stack — locked in

These are decided. Don't propose swaps without asking.

- **Framework:** Next.js 16 (App Router) + TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Neon Postgres (serverless) + Drizzle ORM
- **Auth:** Clerk
- **AI:** Anthropic API (Claude with vision for PDF parsing). Look up the current recommended model in https://docs.claude.com/en/docs_site_map.md before hardcoding model strings.
- **Background jobs:** Inngest
- **File storage:** Cloudflare R2 (S3-compatible)
- **Maps:** Mapbox GL JS + Mapbox Geocoding API
- **Validation:** Zod everywhere — API inputs, AI outputs, env vars
- **Hosting:** Vercel (Hobby tier — non-commercial portfolio use)

## Conventions

### TypeScript
- `strict: true` in tsconfig. No `any`. If you can't avoid it, use `unknown` and narrow.
- Prefer `type` over `interface` unless declaration merging is needed.
- Zod schemas are the source of truth — derive types with `z.infer<typeof Schema>` rather than maintaining parallel type declarations.

### File structure
```
app/                      # Next.js App Router pages and route handlers
  (auth)/                 # Public auth pages (sign-in, sign-up)
  (app)/                  # Protected app — Clerk middleware enforces auth
    trips/
    trips/[tripId]/
  api/
    inngest/route.ts      # Inngest webhook endpoint
components/
  ui/                     # shadcn components (don't edit directly)
  trips/                  # Trip-specific components
  itinerary/              # Itinerary view, segment cards, map
lib/
  db/                     # Drizzle schema + client
  ai/                     # Anthropic client + parsing prompts + Zod output schemas
  r2/                     # R2 client wrapper
  mapbox/                 # Geocoding helpers
  inngest/                # Inngest client + function definitions
  utils/                  # Pure utility functions
schemas/                  # Shared Zod schemas (cross-cutting)
docs/                     # PRD, architecture, phase docs
```

### Imports
- Absolute imports via `@/` (configured in tsconfig). Never `../../../lib/...`.
- Group: external packages → `@/` imports → relative imports, with blank lines between groups.

### Naming
- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utilities: `kebab-case.ts` for files, `camelCase` for exports
- Database tables: `snake_case` (Drizzle handles the JS→SQL mapping)
- Zod schemas: `SomethingSchema`, types as `Something`

### Server vs client components
- Default to Server Components. Only add `"use client"` when you actually need state, effects, or browser APIs.
- Mutations through Server Actions, not API route handlers, unless there's a reason (e.g. webhook endpoints).
- API route handlers exist for: Inngest webhook, Clerk webhook, anything called by external services.

### Error handling
- Server Actions return `{ ok: true, data } | { ok: false, error }` — never throw across the boundary.
- AI parsing can fail. Always wrap Anthropic calls in try/catch and surface a user-friendly message ("we couldn't read this PDF — try a clearer scan").
- Background jobs (Inngest) have automatic retries — let them retry transient failures, don't add manual retry loops.

### Database
- All schema changes go through Drizzle migrations. Never edit the database directly except for inspection.
- Every table has `id`, `created_at`, `updated_at`. Use Drizzle's timestamp helpers.
- Foreign keys with `onDelete: 'cascade'` for owned relationships (trip → bookings → segments).
- Index any column you filter or join on.

### AI / Anthropic API
- Always use structured outputs via tool_use or response prefilling with a Zod schema.
- Validate the AI's response with Zod before writing to the DB. If validation fails, mark the booking `parsing_failed` with the validation error stored — don't crash the job.
- Don't put raw PDFs in the database. Store in R2, keep the R2 key in the booking row.
- Prompt engineering lives in `lib/ai/prompts/`. One file per booking type. Each prompt file exports `{ systemPrompt, userPromptTemplate, outputSchema }`.

### Environment variables
- All env vars validated by Zod at startup (`lib/env.ts`). The app should refuse to boot if any are missing or malformed.
- `.env.example` is committed. `.env.local` is gitignored.

### Git
- Branch per phase: `phase-1-foundation`, `phase-2-uploads`, etc.
- Commits should be small and atomic. Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`).
- I'll handle PRs and merges. You handle commits within a working branch.

## Anti-patterns — don't do these

- **Don't reach for `useEffect`** to fetch data. Server Components or Server Actions instead.
- **Don't use Context for server state.** React Query / SWR if needed on the client, but most data should come from the server.
- **Don't store dates as strings.** Postgres `timestamptz` + a separate `timezone` column (IANA name like `America/Toronto`).
- **Don't blanket-suppress TypeScript errors.** If something genuinely needs `@ts-expect-error`, leave a comment explaining why.
- **Don't add a new dependency without asking.** Especially UI libraries, state libraries, or anything that overlaps with what we already use.
- **Don't write tests retroactively to chase coverage.** Tests are written via the TDD skill during implementation, not bolted on afterward. When the red-green-refactor cycle activates, follow it: failing test first, then minimal code to pass, then refactor.
- **Don't generate placeholder data and call it done.** If a feature needs real data flow to work, build the flow. Mocks are okay during a phase but flagged explicitly.

## When you're unsure

Ask one focused question rather than guessing. I'd rather answer a clarifying question now than untangle a wrong direction later. If you're stuck between two reasonable options, present them as A/B with trade-offs and let me pick.

## Free tier awareness

Every external service in this stack is on a free tier. Be mindful:
- Neon: 0.5 GB storage per project. Don't store anything large in Postgres.
- Vercel Hobby: 1 GB Blob (we're not using it — we use R2), 1M function invocations/month.
- Cloudflare R2: 10 GB storage, 10 GB egress/month — plenty.
- Inngest: 50k runs/month.
- Mapbox: 50k map loads + 100k geocoding/month.
- Anthropic API: pay-as-you-go, no free tier. Each PDF parse costs a few cents.

If a decision could push us off a free tier (e.g. storing PDFs forever, indexing the wrong column), flag it.

## What "done" looks like for any task

1. Code compiles with `npm run typecheck`.
2. `npm run lint` is clean.
3. The happy path works end-to-end manually.
4. At least one obvious failure case is handled (empty state, bad input, network error).
5. New env vars added to `.env.example` and `lib/env.ts`.
6. If schema changed: migration generated and applied.
7. A one-paragraph commit message that explains *why*, not just *what*.
