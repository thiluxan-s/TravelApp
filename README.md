# Wayfare

**A travel second brain.** Drop in your booking confirmation PDFs and get back a single, calm daily itinerary — with a map, and with the app quietly pointing out the things that will bite you. *"Check-in closes at 22:00 — your flight lands at 23:40."*

Booking confirmations arrive scattered: a flight in Gmail, a hotel PDF on your phone, a screenshot of something else. Reassembling "what am I doing Tuesday?" means hunting through three apps at exactly the moment you least want to. Wayfare is the place to put them.

**[Live demo →](https://travel-app-mu-pearl.vercel.app/demo)** — a pre-seeded Tokyo trip, no sign-up needed.

---

## Screenshots

<!--
TODO — capture these three and drop them in docs/images/:
  1. itinerary.png  — trip detail page, timeline + map side by side, with an annotation
                      pill visible between two events. The money shot.
  2. parsing.png    — mid-upload: the amber parsing banner with a booking in flight.
  3. failure.png    — a failed parse: red banner + bookings panel showing the error
                      and the Try again / Remove controls.
Then replace this comment with the image tags.
-->

---

## What it does

1. **Upload** a PDF or photo of a flight or hotel confirmation.
2. **A background job parses it.** A cheap classifier decides what kind of document it is, then a type-specific prompt extracts structured fields via tool use, validated against a Zod schema before anything touches the database. Addresses get geocoded once and cached.
3. **The itinerary assembles itself.** Events group by local day — in *their own* timezone, not yours — sort chronologically, and render as type-specific cards on a timeline beside a map.
4. **The app reads the gaps.** Between adjacent events it computes time gaps, geographic distance, and conflicts: a flight landing after the hotel's check-in window closes, a checkout leaving under 90 minutes before departure, two bookings overlapping.

If a parse fails, it says so, and gives you a retry or a remove — it does not quietly swallow the document.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                Next.js 16 App (Vercel)                  │
│   Server Components (read) · Server Actions (write)     │
│   Route handlers (webhooks only) · Clerk middleware     │
└─────────────────────────────────────────────────────────┘
      │            │            │             │
      ▼            ▼            ▼             ▼
 ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐
 │  Neon   │ │Cloudflare│ │ Inngest  │ │ Anthropic  │
 │Postgres │ │    R2    │ │  (jobs)  │ │  (vision)  │
 │+Drizzle │ │  (PDFs)  │ │          │ │            │
 └─────────┘ └──────────┘ └────┬─────┘ └────────────┘
                               ▼
                        ┌────────────┐
                        │   Mapbox   │
                        └────────────┘
```

**The upload path**, which is the flow everything else hangs off:

```
client → Server Action mints a presigned R2 URL + a `uploading` booking row
       → client PUTs the file straight to R2 (never through the function)
       → Server Action flips to `parsing`, emits booking/uploaded
       → Inngest: classify → extract → geocode → write segments → `parsed`
       → page polls while anything is in flight; new events appear on the timeline
```

More detail in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

## Design decisions worth defending

**Parsing runs in a background job, not in the request.** Vision parsing takes 5–15 seconds. Inline, that would block the request, risk a function timeout, and feel awful. The "parsing…" card is a feature, not an apology — and it means Inngest owns retries instead of me hand-rolling them.

**Files go to R2 directly from the browser** via a presigned URL, so large PDFs never traverse a serverless function. R2 also has no egress fees and 10 GB free, versus Vercel Blob's 1 GB on Hobby.

**AI parses; plain code reasons.** The model's only job is turning an unstructured PDF into structured fields. Every annotation — gaps, distances, conflicts — is computed deterministically in pure functions. Faster, cheaper, testable, and it can't hallucinate a conflict that isn't there. This is the decision I'd defend hardest.

**Two prompts, not one.** A cheap Haiku classifier picks the document type, then a type-specific Sonnet prompt extracts it. A single mega-prompt handling every booking type is worse at all of them, and the split means adding a type doesn't regress the others.

**The AI's output is validated before it's trusted.** Tool use gives structured output, Zod validates it, and a schema mismatch marks the booking `parsing_failed` with the error stored rather than writing garbage or crashing the job.

**Timestamps are `timestamptz` plus a separate IANA timezone column.** A flight departs at a wall-clock time in one zone and arrives at a wall-clock time in another. Storing strings, or a single UTC instant without the zone, makes "which local day is this on?" unanswerable — and that question is the entire itinerary.

**Every query goes through a repository function.** No raw Drizzle in components or actions, so the ownership checks live in one layer and there's one place to look when auditing them.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 — App Router, Server Components, Server Actions |
| Language | TypeScript, `strict: true`, no `any` |
| Auth | Clerk |
| Database | Neon Postgres + Drizzle ORM |
| File storage | Cloudflare R2 (S3-compatible) |
| AI | Anthropic API — Claude vision, structured output via tool use |
| Background jobs | Inngest |
| Maps | Mapbox GL JS + Geocoding API |
| Validation | Zod — API inputs, AI outputs, env vars |
| Testing | Vitest |
| Hosting | Vercel |

## Running locally

```bash
git clone https://github.com/thiluxan-s/TravelApp
cd TravelApp
npm install

cp .env.example .env.local
# Fill in .env.local — every var is documented inline with where to get it

npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To exercise the parsing pipeline locally you also need the Inngest dev server:

```bash
npx inngest-cli@latest dev     # dashboard at localhost:8288
```

Env vars are validated by Zod at startup — the app refuses to boot on anything missing or malformed, rather than failing later with something cryptic.

The Clerk webhook can't reach localhost. `ensureUserExists()` in the app layout creates the user row on first sign-in as a fallback, so no ngrok is needed for local dev.

| Script | |
|--------|--|
| `npm run dev` | Dev server (Turbopack) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run db:generate` / `db:migrate` | Drizzle migrations |
| `npm run seed:demo` | Seed the public demo trip |

## Testing

The itinerary logic — day grouping across timezones, annotation computation, haversine distance, booking status summarization — is pure functions with unit tests, because that's where the behavior that matters lives and where the real bugs have been.

React components and server actions are not unit tested. Vitest here runs in `environment: 'node'` with no jsdom and no database harness, so testing them would mean mocking Clerk, Postgres, R2, and Inngest and asserting on the mocks — which proves very little. That's a real gap rather than a considered end state: a DB harness that seeds two users and asserts the ownership checks reject the wrong one is the highest-value thing to add next, and it's on the [backlog](docs/BACKLOG.md).

## What I'd build next

- **Trains and reservations.** Flights and hotels are maybe a third of what's actually in your inbox. Today the parse job branches on booking type in three separate steps, so the first move is collapsing that into a registry of per-type handlers — after which a new type is one prompt, one schema, one card, and no changes to the job that runs them.
- **Calendar export.** An `.ics` download so the itinerary lives on your phone, offline, where you need it on spotty foreign data.
- **Make `parsing_failed` genuinely terminal.** Today the status is written before Inngest exhausts its retries, so a transient API error can surface as a permanent failure. It belongs in the `onFailure` handler. ([details](docs/BACKLOG.md))
- **Share links.** A read-only URL to send the person you're travelling with.
- **Email forwarding.** `forward to trips@…` removes the last manual step, at the cost of inbound email infrastructure.

## Project docs

| | |
|--|--|
| [`docs/PRD.md`](docs/PRD.md) | Problem, scope, non-goals, and why each was drawn there |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design and the reasoning |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Schema and its trade-offs |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Known gaps, honestly listed |
| [`docs/phases/`](docs/phases/) | The six build phases |
| [`docs/superpowers/`](docs/superpowers/) | Design specs and implementation plans per phase |

---

Built by [Thiluxan](https://github.com/thiluxan-s) as a portfolio project.
