# Phase 3 — AI Parsing Design

## Goal

Uploaded booking files get parsed by Claude (vision) into structured segment data. Mapbox geocodes the locations. The trip page shows real parsed data instead of "Parsing with AI…" placeholders.

## Architecture

A four-step Inngest background function triggered by `booking/uploaded`. Each step is cached — retries resume from the failed step without re-running earlier ones (important because AI calls cost money).

```
booking/uploaded event
        │
        ▼
step 1 — classify   → Claude identifies "flight" | "hotel" | "unknown"
        │
        ▼
step 2 — extract    → Claude tool_use call returns validated JSON matching Zod schema
        │
        ▼
step 3 — geocode    → Mapbox returns lat/lng for each address/airport
        │
        ▼
step 4 — write      → single DB transaction: insert segment(s), update booking status + type
```

On unhandled error: top-level catch sets `booking.status = 'parsing_failed'` and stores a user-facing message in `booking.parse_error`.

No fixture/dev mode — all parsing hits the live Anthropic API.

## File Structure

```
lib/ai/
  client.ts                        — Anthropic SDK instance (singleton)
  prompts/
    classifier.ts                  — system prompt + user template for classify step
    flight.ts                      — system prompt + user template for flight extraction
    hotel.ts                       — system prompt + user template for hotel extraction
  schemas/
    flight.ts                      — Zod schema for flight details JSONB + tool JSON schema
    hotel.ts                       — Zod schema for hotel details JSONB + tool JSON schema

lib/mapbox/
  client.ts                        — geocode(query) → { lat, lng } | null

lib/inngest/
  client.ts                        — Inngest client instance
  functions/
    parse-booking.ts               — the 4-step parsing function

app/api/inngest/
  route.ts                         — Next.js route handler serving registered Inngest functions

lib/db/repositories/
  segments.ts                      — createSegment, getSegmentsByBookingId
```

Modified files:

- `lib/db/schema.ts` — add segments table + missing booking columns (type, parse_error, raw_ai_output)
- `lib/env.server.ts` — add ANTHROPIC_API_KEY, MAPBOX_SECRET_TOKEN, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
- `app/(app)/trips/[tripId]/actions.ts` — fire `booking/uploaded` event in confirmBookingUploadedAction
- `components/trips/BookingCard.tsx` — render segment data in parsed state, wire parse_error in failed state
- `.env.example` — document new env vars

## Data Layer

### New migration

**`segments` table** (matches DATA_MODEL.md exactly):

```ts
{
  id: uuid (pk, gen_random_uuid())
  booking_id: uuid (fk → bookings.id, cascade, indexed)
  trip_id: uuid (fk → trips.id, cascade, indexed)       // denormalized for query speed
  type: enum('flight', 'hotel_stay')
  start_time: timestamptz (not null)
  start_timezone: text (not null)                        // IANA e.g. 'America/Toronto'
  end_time: timestamptz (not null)
  end_timezone: text (not null)
  start_location: text (not null)                        // human-readable: "Toronto Pearson (YYZ)"
  start_lat: numeric(9,6) (nullable)
  start_lng: numeric(9,6) (nullable)
  end_location: text (not null)
  end_lat: numeric(9,6) (nullable)
  end_lng: numeric(9,6) (nullable)
  details: jsonb (not null)                              // type-specific, Zod-validated
  created_at: timestamptz (not null)
  updated_at: timestamptz (not null)
}
```

Index: `(trip_id, start_time)` — the itinerary query.

**Missing booking columns** added in the same migration:

```ts
type: enum('flight', 'hotel', 'unknown')  // default 'unknown'
parse_error: text (nullable)
raw_ai_output: jsonb (nullable)
```

## AI Layer

### Anthropic client (`lib/ai/client.ts`)

Singleton `Anthropic` instance using `ANTHROPIC_API_KEY`.

- Classifier call: `claude-haiku-4-5-20251001` — cheap model, simple single-word task
- Extraction call: `claude-sonnet-4-6` — better structured extraction accuracy

### Classifier call

Simple text response — no tool needed. System prompt instructs Claude to respond with exactly one word: `flight`, `hotel`, or `unknown`. If `unknown`, skip extraction and mark `parsing_failed` with message: "We couldn't identify this document as a flight or hotel booking."

File is passed as a `url`-type document source — we generate a presigned GET URL from R2 (expiry: 3600 seconds) and Claude fetches it directly.

### Extraction call (tool_use)

Defines one tool per booking type (`record_flight_booking` / `record_hotel_booking`). The tool's JSON schema is derived from the Zod schema via `zod-to-json-schema`. Force tool use with:

```ts
tool_choice: { type: 'tool', name: 'record_flight_booking' }
```

Claude's response is the tool call arguments — validated through the Zod schema before any DB write. If Zod validation fails, mark `parsing_failed` with message: "The AI extracted data in an unexpected format."

### Zod schemas

**Flight details** (`lib/ai/schemas/flight.ts`):

```ts
{
  flight_number: string;
  airline: string;
  confirmation_code: string | null;
  departure_airport_code: string; // "YYZ"
  arrival_airport_code: string; // "NRT"
  departure_terminal: string | null;
  arrival_terminal: string | null;
  seat: string | null;
  cabin_class: string | null; // "Economy"
}
```

**Hotel details** (`lib/ai/schemas/hotel.ts`):

```ts
{
  hotel_name: string;
  address: string;
  confirmation_code: string | null;
  room_type: string | null;
  guests: number | null;
  check_in_time: string | null; // "15:00"
  check_out_time: string | null; // "11:00"
  phone: string | null;
}
```

## Mapbox Layer

`lib/mapbox/client.ts` exports:

```ts
geocode(query: string): Promise<{ lat: number; lng: number } | null>
```

- Calls the Mapbox Geocoding API using `MAPBOX_SECRET_TOKEN` (server-only, never client-exposed)
- Returns first result's coordinates or `null` on no match or error
- Failures return `null` — ungeocoded segments are valid, they just won't show map pins
- For flights: called twice — `"YYZ airport"` for departure, `"NRT airport"` for arrival
- For hotels: called once with the full address string

No in-memory cache needed — each booking geocodes once and coordinates are persisted to the segment row.

## Inngest Layer

### Client (`lib/inngest/client.ts`)

```ts
export const inngest = new Inngest({ id: "wayfare" });
```

Uses `INNGEST_EVENT_KEY` (production) / `INNGEST_SIGNING_KEY` (production). Local dev uses placeholder values and routes through the Inngest local dev server.

### Webhook route (`app/api/inngest/route.ts`)

Standard `serve()` handler registering all Inngest functions. This is the endpoint Inngest calls to run functions — both locally (via the Inngest dev server) and in production.

### Parsing function (`lib/inngest/functions/parse-booking.ts`)

Triggered by event `booking/uploaded` with payload `{ bookingId: string }`.

```
step 1 — "classify":
  - Fetch booking from DB (get file_key, trip_id)
  - Generate presigned GET URL from R2
  - Call classifier prompt → "flight" | "hotel" | "unknown"
  - If "unknown": update booking status='parsing_failed', parse_error=friendly message, return early
  - Update booking.type in DB
  - Return: { bookingType, fileUrl }

step 2 — "extract":
  - Call type-specific extraction prompt with tool_use
  - Validate response through Zod schema
  - If validation fails: update booking status='parsing_failed', return early
  - Store raw AI output to booking.raw_ai_output
  - Return: validated details JSON + extracted times/locations

step 3 — "geocode":
  - Call geocode() for each location (2 calls for flights, 1 for hotels)
  - Return: { startLat, startLng, endLat, endLng } (any can be null)

step 4 — "write":
  - Single DB transaction:
    - Check if a segment with this booking_id already exists (idempotency guard for retries)
    - If none exists: insert segment row with all data from steps 2 + 3
    - Update booking.status = 'parsed'
  - Return: { segmentId }
```

Top-level catch: `booking.status = 'parsing_failed'`, `booking.parse_error = 'Something went wrong while parsing your document.'`

### Event trigger

In `confirmBookingUploadedAction` (already has placeholder comment):

```ts
await inngest.send({ name: "booking/uploaded", data: { bookingId } });
```

## UI Updates

### BookingCard — `parsed` state

**Flight:**

- Route line: `YYZ → NRT`
- Details: `AC 005 · Air Canada`
- Times: departure and arrival in local timezone (formatted from `start_time` + `start_timezone`)

**Hotel:**

- Hotel name
- Date range: check-in → check-out dates
- Address

### BookingCard — `parsing_failed` state

Wire `booking.parseError` into the existing error display (currently shows generic fallback). No new UI elements.

### Polling

No changes needed. `TripDetailClient` already stops polling when no bookings remain in `parsing` status. `parsed` and `parsing_failed` both stop the loop.

## Environment Variables

New additions to `lib/env.server.ts` and `.env.example`:

```
ANTHROPIC_API_KEY=sk-ant-xxxx
MAPBOX_SECRET_TOKEN=sk.eyJ...
INNGEST_EVENT_KEY=xxxx
INNGEST_SIGNING_KEY=signkey-xxxx
```

Local dev Inngest values: `INNGEST_EVENT_KEY=local` and no signing key needed (dev server doesn't verify).

## Error Handling

| Failure point                | Behaviour                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| R2 fetch fails               | Step 1 throws → Inngest retries                                                    |
| Classifier returns `unknown` | Mark `parsing_failed`, friendly message, stop                                      |
| Anthropic API error          | Step 2 throws → Inngest retries                                                    |
| Zod validation fails         | Mark `parsing_failed`, message about unexpected format                             |
| Mapbox error                 | `null` coords — segment still written, no map pin                                  |
| DB write fails               | Step 4 throws → Inngest retries (insert is idempotent — re-check before inserting) |
| All retries exhausted        | Top-level catch → `parsing_failed`                                                 |

## Dev Workflow

Run two terminals:

1. `npm run dev` — Next.js app on localhost:3000
2. `npx inngest-cli@latest dev` — Inngest dev server on localhost:8288

The Inngest dev server auto-discovers functions via the `/api/inngest` webhook route and runs them locally when events are fired.
