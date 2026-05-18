# Phase 3 — AI Parsing

**Goal:** Uploaded files get parsed by Claude (vision) into structured segments. Mapbox geocodes the addresses. The trip page shows real parsed data, not just "parsing..." placeholders.

**Prerequisite:** Phase 2 complete.

## Deliverables (high level)

1. Schema addition: `segments` table.
2. Anthropic client wrapper (`lib/ai/`) with the parsing prompts and Zod output schemas.
3. Mapbox client wrapper (`lib/mapbox/`) with a `geocode(query)` function that returns `{ lat, lng }` or `null`. Caches results by address string in-memory per request.
4. Inngest configured: events, function, dev server, webhook route at `/api/inngest`.
5. The parsing Inngest function:
   - Triggered by `booking.uploaded`.
   - Fetches PDF from R2.
   - Step 1: classifier prompt → `flight` | `hotel` | `unknown`.
   - Step 2: type-specific extraction prompt → JSON validated by Zod schema.
   - Step 3: geocode any addresses/airport codes via Mapbox.
   - Step 4: write segments in a single transaction; update booking status.
   - On any failure: status `parsing_failed`, error message stored.
6. UI:
   - Booking cards show parsed segments when ready.
   - Failed bookings show the user-facing error and a "delete" action.
   - List view polls every 3s while any booking is in `parsing` status; stops polling when none are.

## Notes for when we get here

- Use Anthropic's tool_use to force structured output. Look up current best practices in https://docs.claude.com/en/docs_site_map.md before committing to an approach.
- Airport code geocoding: most major airports geocode well with Mapbox if you query `"YYZ airport"` or the full name. Cache aggressively.
- During development, save the raw AI output for a few test PDFs as fixtures in `__fixtures__/` so we don't burn API credits on every parser change. Add a `PARSE_FROM_FIXTURE=1` env var that skips the live API call and loads from fixture.
- Inngest dev server runs locally; production hits hosted Inngest. Both work with the same code.

---

(More detail to be added before starting this phase.)
