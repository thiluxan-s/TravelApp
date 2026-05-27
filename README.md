# Wayfare

A travel "second brain" — upload your booking confirmation PDFs (flights and hotels) and get back a unified daily itinerary with a map. Built as a portfolio project demonstrating Next.js App Router, AI-powered PDF parsing via the Anthropic API, background job processing with Inngest, and real-time UI updates.

**Live demo:** https://wayfare-xxx.vercel.app <!-- replace with real URL after deploy -->

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| Auth | Clerk |
| Database | Neon Postgres + Drizzle ORM |
| File storage | Cloudflare R2 (Phase 2) |
| AI parsing | Anthropic API — Claude vision (Phase 3) |
| Background jobs | Inngest (Phase 3) |
| Maps | Mapbox GL JS (Phase 5) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Validation | Zod throughout |
| Hosting | Vercel |

## Running locally

```bash
git clone https://github.com/<you>/TravelApp
cd TravelApp
npm install

# Set up env vars
cp .env.example .env.local
# Edit .env.local — see .env.example for required vars and where to get them

# Apply database migrations
npm run db:migrate

# Start dev server (Turbopack)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The Clerk webhook can't reach localhost. For local dev, `ensureUserExists()` in the app layout creates the user row on first sign-in as a fallback — no ngrok needed.

## Deployment

1. Import the repo in [Vercel](https://vercel.com).
2. Add all env vars from `.env.example` in Vercel project settings.
3. In the Clerk dashboard → **Webhooks**, add `https://<your-vercel-url>/api/clerk/webhook` subscribed to `user.created`, `user.updated`, `user.deleted`. Copy the signing secret into `CLERK_WEBHOOK_SECRET` in Vercel.
4. Deploy.

## Roadmap

See [`docs/PRD.md`](docs/PRD.md) for the full feature list. Phases remaining:

- **Phase 2:** Trip CRUD + Cloudflare R2 upload pipeline
- **Phase 3:** Inngest background jobs + Anthropic AI parsing
- **Phase 4:** Daily itinerary view with timeline and smart annotations
- **Phase 5:** Mapbox GL JS map with location pins
- **Phase 6:** Polish, demo seed data, and a proper README
