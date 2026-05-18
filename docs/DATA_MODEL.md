# Data Model

## Entity relationship

```
User (1) ──< (N) Trip (1) ──< (N) Booking (1) ──< (N) Segment
```

- A **User** has many **Trips**.
- A **Trip** has many **Bookings** (each booking is one uploaded document).
- A **Booking** has many **Segments** (one flight booking PDF can contain outbound + return = 2 segments).
- All deletions cascade downward.

## Table-by-table

### `users`

We store a thin user row keyed to Clerk. Clerk owns auth and profile data; this table exists so we can foreign-key other tables to a stable internal ID.

```ts
{
  id: uuid (pk, default gen_random_uuid())
  clerk_user_id: text (unique, not null, indexed)
  email: text (not null)
  created_at: timestamptz (not null, default now())
  updated_at: timestamptz (not null, default now())
}
```

Created on first Clerk webhook (`user.created`) or lazily on first sign-in if the webhook hasn't fired yet.

### `trips`

```ts
{
  id: uuid (pk)
  user_id: uuid (fk → users.id, on delete cascade, indexed)
  title: text (not null)                       // "Japan March 2026"
  destination: text (nullable)                 // free text — "Tokyo + Kyoto", "Europe"
  start_date: date (nullable)                  // optional, can be inferred from bookings
  end_date: date (nullable)
  created_at: timestamptz (not null)
  updated_at: timestamptz (not null)
}
```

**Why is destination free text?** Trip names are messy. "Japan", "Tokyo + Kyoto", "Europe trip 2026", "Asha's wedding" — none of these map cleanly to a structured location. Don't force it.

**Why are dates nullable?** Some users will create a trip before adding bookings. We can show "no dates yet" and infer them from segments once bookings exist.

### `bookings`

One row per uploaded file. This is the *document*, not the trip event(s) inside it.

```ts
{
  id: uuid (pk)
  trip_id: uuid (fk → trips.id, on delete cascade, indexed)
  type: enum('flight', 'hotel', 'unknown')     // determined by classifier
  status: enum(
    'uploading',      // pre-signed URL issued, file not yet confirmed
    'parsing',        // file in R2, Inngest job running or queued
    'parsed',         // segments created successfully
    'parsing_failed'  // AI couldn't extract or validation failed
  )
  file_key: text (not null)                    // R2 object key
  file_name: text (not null)                   // original filename for display
  file_size_bytes: integer (not null)
  mime_type: text (not null)
  parse_error: text (nullable)                 // user-facing error message when failed
  raw_ai_output: jsonb (nullable)              // store for debugging; can be cleared later
  created_at: timestamptz (not null)
  updated_at: timestamptz (not null)
}
```

**Why store `raw_ai_output`?** During development and for debugging real failures. We can null it out after 30 days as a cleanup job, or skip it on R2 cleanup. Don't index this column.

**Why `type` defaults to `unknown`?** The classifier runs as part of the parsing job. Before that completes, we genuinely don't know. Better than guessing.

### `segments`

The actual trip events. This is what the itinerary view queries.

```ts
{
  id: uuid (pk)
  booking_id: uuid (fk → bookings.id, on delete cascade, indexed)
  trip_id: uuid (fk → trips.id, on delete cascade, indexed)  // denormalized for query speed
  type: enum('flight', 'hotel_stay')
  
  // Timing — always UTC in DB, with IANA timezone separately
  start_time: timestamptz (not null)
  start_timezone: text (not null)              // e.g. 'America/Toronto'
  end_time: timestamptz (not null)
  end_timezone: text (not null)                // for flights, often differs from start
  
  // Geography
  start_location: text (not null)              // human-readable: "Toronto Pearson (YYZ)"
  start_lat: numeric(9,6) (nullable)
  start_lng: numeric(9,6) (nullable)
  end_location: text (not null)
  end_lat: numeric(9,6) (nullable)
  end_lng: numeric(9,6) (nullable)
  
  // Type-specific stuff
  details: jsonb (not null)                    // schema validated by Zod per type
  
  created_at: timestamptz (not null)
  updated_at: timestamptz (not null)
}
```

**Index `trip_id, start_time`** — every itinerary query filters by trip and orders by time.

**Why denormalize `trip_id` onto segments?** The itinerary query is the hottest read in the app. Denormalizing saves the booking join. We pay the cost of keeping it in sync, which is trivial because segments are created in a single transaction with their booking.

**Why store `start_timezone` and `end_timezone` separately?** Flights span timezones. A flight from Toronto to Tokyo starts in `America/Toronto` and ends in `Asia/Tokyo`. Rendering "arrives at 14:30 local time" requires knowing which local. Hotel stays will usually have both equal.

**Why `numeric` for lat/lng instead of `float`?** Floating-point coordinates introduce tiny errors over equality comparisons. `numeric(9,6)` gives us ~10cm precision, plenty for showing pins on a map.

### `details` JSONB shape (validated by Zod)

For `type = 'flight'`:
```ts
{
  flight_number: string,           // "AC 005"
  airline: string,                 // "Air Canada"
  confirmation_code: string | null,
  departure_airport_code: string,  // "YYZ"
  arrival_airport_code: string,    // "NRT"
  departure_terminal: string | null,
  arrival_terminal: string | null,
  seat: string | null,
  cabin_class: string | null,      // "Economy"
}
```

For `type = 'hotel_stay'`:
```ts
{
  hotel_name: string,
  address: string,
  confirmation_code: string | null,
  room_type: string | null,
  guests: number | null,
  check_in_time: string | null,    // "15:00" — string because it's a clock time, not a date
  check_out_time: string | null,   // "11:00"
  phone: string | null,
}
```

Zod schemas live in `lib/ai/schemas/`. The AI is prompted to produce JSON matching the schema, we validate, then we insert.

## What we deliberately don't model

- **No separate `Airport` or `Hotel` table.** No need to normalize when we don't show "all bookings at this hotel across users." Free text + lat/lng is enough.
- **No `Annotation` table.** Annotations (timing gaps, conflicts) are derived at query time. Storing them would mean recomputing on every segment change.
- **No `Day` table.** The day grouping is a function of segments + timezone. Querying segments and grouping in code is fine.
- **No soft deletes.** Hard delete with cascade. We can revisit if users complain about accidental loss.

## Migrations

Drizzle generates migrations into `drizzle/`. Workflow:

```bash
# After editing lib/db/schema.ts
npm run db:generate          # creates a new migration file
npm run db:migrate           # applies pending migrations to the configured DB

# For local development tinkering only
npm run db:push              # skip migration files, push schema directly
```

We always commit generated migrations. Never edit a migration after it's been applied to any environment.

## Seeding

A `scripts/seed.ts` will create one demo user, one demo trip ("Tokyo March 2026"), and two parsed bookings (one flight, one hotel) with realistic segments. Used for local development and as the demo trip on the deployed app so a recruiter doesn't have to upload anything to see value.
