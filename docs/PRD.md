# PRD — Wayfare

## Problem

Travel bookings arrive scattered: a flight confirmation in Gmail, a hotel PDF downloaded to a phone, a restaurant booking screenshotted from a website. When you're actually traveling, reassembling "what am I doing Tuesday?" means hunting through email, downloads, and screenshots. The mental load is highest exactly when you want it lowest.

## Solution

A single place to dump booking confirmations and get back a calm, unified view of the trip. Upload a PDF → it gets parsed → it appears on a daily itinerary with a map. The app understands the relationships between events (timing gaps, distances, conflicts) and surfaces them as quiet annotations rather than buried details.

## Target user (v1)

Me, and people like me: people who travel a few times a year, are comfortable with technology, and already have the booking documents — they just don't have a good place to put them. Not business travelers (different feature set), not casual once-a-year vacationers (won't bother with another tool).

## Non-goals (explicitly)

- **Booking flights or hotels.** This is not a travel agent. We never compete with Booking.com or Expedia.
- **Email integration in v1.** Email forwarding is a v2 feature. v1 is upload-only.
- **Trip planning from scratch.** This is for trips you've already booked. If you have no bookings, this app has nothing to do.
- **Sharing trips with companions.** Single-user view in v1.
- **Mobile native apps.** Mobile web (responsive) is enough.

## v1 scope — what ships in 6 weekends

A signed-in user can:
1. Create a trip with a title, destination string, and optional date range.
2. Upload PDF or image files of booking confirmations (flights and hotels only).
3. See those files parse asynchronously into structured bookings and segments.
4. View a unified daily itinerary for the trip with:
   - Day-grouped timeline of events
   - Type-specific cards (flight cards look different from hotel cards)
   - Map view showing pins for the day's locations
   - Intelligent annotations between events (gaps, distances, conflicts)
5. Edit or delete a trip and have all associated files and data clean up.
6. Sign out.

That's it. Anything not on this list is v2 or later.

## v2 — written down so we don't forget, but explicitly *not* built in v1

- Email forwarding ("forward to trips@wayfare.app")
- Restaurants, activities, trains, car rentals as booking types
- Conversational Q&A about the trip ("what's my Tuesday look like?")
- Nearby suggestions (gyms, restaurants, things to do)
- Trip sharing with companions
- Calendar export / sync
- Mobile native apps
- Offline mode

## Success criteria

This is a portfolio piece, so success is measured by what it demonstrates to someone reviewing my work:

1. **The demo lands in under 90 seconds.** Sign in → upload two PDFs → see the itinerary with map → see at least one intelligent annotation. A recruiter who clicks the link should "get it" before they get distracted.
2. **The architecture is legible.** A developer reading the README + browsing the repo for 10 minutes can understand the system, the choices, and the trade-offs.
3. **It looks like a real product, not a demo.** Real loading states, real empty states, real error handling for bad PDFs. No "TODO" buttons, no Lorem Ipsum, no placeholder routes.
4. **The README sells it.** Architecture diagram, screenshot of the itinerary, link to a deployed demo, and a short "things I'd build next" roadmap that shows product thinking.

## Constraints

- **Free tier only** for v1. No paid services. Anthropic API is the one exception (pay-as-you-go).
- **Solo builder, weekends only.** Scope must be aggressively limited. When in doubt, cut.
- **No real users.** This is a portfolio piece. Don't over-engineer for scale we won't have.

## Key decisions and the reasoning

- **Why upload only, not email forwarding in v1?** Email forwarding requires inbound email infrastructure (Postmark/SendGrid inbound), parsing routing, spam handling, and email-to-user attribution. Cuts 2-3 weekends. v2.
- **Why flights and hotels only?** They're the two booking types that create most of the timing tension a traveler feels. Adding restaurants/activities triples prompt complexity and edge cases.
- **Why itinerary + map as the wow feature instead of conflict detection?** Conflict detection becomes a natural enhancement *within* the itinerary view (annotations between events) rather than a separate feature. Cleaner. Both ship.
- **Why Next.js + Postgres instead of staying close to my CLO stack (React/Vite + DynamoDB)?** Portfolio piece should demonstrate range. Next.js App Router + Server Components is the modern standard. Postgres is a useful contrast to my DynamoDB experience. Drizzle + Zod still leans into my schema-first habits.
- **Why Anthropic for parsing instead of OpenAI + Tesseract?** One API call instead of a multi-stage pipeline. Vision handles both PDF text and scanned images. Structured outputs via tool use map cleanly to Zod schemas.
- **Why R2 over S3 or Vercel Blob?** R2 has 10 GB free storage with no egress fees, vs. Vercel Blob's 1 GB on Hobby. Also a chance to show I can integrate beyond a single vendor's stack.
