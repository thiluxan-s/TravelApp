# Phase 7E — Calendar Export: Design Spec

**Date:** 2026-08-02
**Status:** Approved
**Parent spec:** `docs/superpowers/specs/2026-07-28-phase-7-booking-types-design.md` (stage 4 of 4)

---

## Goal

Let the itinerary leave the browser. Wayfare knows your whole trip but can only show it on a page you have to go find — which is where you need it least while travelling. A `.ics` download puts every booking in the calendar the user already checks.

This is the last stage of Phase 7. It comes last because `to-ics.ts` maps every segment type, so writing it before `train` and `reservation` existed would have meant writing it twice.

---

## What the parent spec already settled

These were decided on 2026-07-28 and are restated here, not reopened:

- **Download, not a subscribable feed.** A live `webcal://` feed is more useful mid-trip, but it needs a token column, an unauthenticated per-trip endpoint, and revocation UI — most of the deferred share-link feature. Download needs no schema change. The feed can ride along with share links later.
- **Times in UTC** (`DTSTART:20260311T100000Z`), not hand-rolled `VTIMEZONE` blocks. We store `timestamptz`, so UTC is exact and clients render in the viewer's local time. Hand-written VTIMEZONE definitions with DST rules are a known source of subtle bugs for no user-visible gain.
- **Hotels emit two point events**, check-in and check-out, rather than one multi-day block that would sit on top of everything else in a phone's day view.
- **No new dependency.** The serializer is a pure function: VCALENDAR wrapper, VEVENT blocks, line folding, escaping.

---

## Decisions made in this stage

### Estimated reservation ends are emitted, and labelled

`ReservationCard` deliberately refuses to render a fabricated range — an estimated dinner shows "7:00 PM", never "7:00 – 8:30 PM". The parent spec's one line, "Reservation: one event using the estimated end," quietly contradicts that stance, so it needed resolving.

**Emit `DTEND` from the estimate, and say so in `DESCRIPTION`:**

```
DESCRIPTION:Table for 2\n\nEnd time is estimated — the confirmation did not
  state one.
```

Rejected alternatives:

- **`DTSTART` only.** Strictly honest, but clients then invent their own default block — 30 minutes in Google Calendar, an hour in Apple Calendar. The user still sees a fabricated duration, only one we neither chose nor labelled. Silence buys nothing.
- **All-day events for estimated reservations.** Unmistakably imprecise, but it detaches a 7pm dinner from its time and floats it to the top of the day, defeating the mid-trip use case the export exists for.

This does not weaken the "don't generate placeholder data" rule. A calendar event's shape *requires* a duration in a way a card's does not; the estimate is disclosed rather than disguised.

### `/demo` gets a working public export

`app/demo/calendar.ics/route.ts` — unauthenticated, reading `env.DEMO_TRIP_ID` (already defined; no new config).

The audience is hiring managers, and "Add to calendar" that downloads a real file is a stronger demo beat than a button that asks them to sign up first. It exposes exactly one trip that `/demo` already renders in full, so no data becomes visible that was not already public. No token, no share-link surface.

### Dispatch: a render-side registry keyed by `SegmentType`

```ts
type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  stamp: Date;
  summary: string;
  description: string | null;
  location: string | null;
  geo: { lat: number; lng: number } | null;
};

const EVENT_BY_SEGMENT_TYPE: Record<SegmentType, (s: Segment) => IcsEvent[]>;
```

The mappers produce this intermediate shape; a single `serializeEvent` handles escaping, folding, and field order for all of them. Escaping in one place rather than four is what keeps the mappers readable and the escaping correct.

Rejected: **extending `BookingTypeHandler`**. It looks like the DRY choice — one registry, and CLAUDE.md's "adding a type is one file" stays literally true — but the two are keyed differently and live in different phases of the request. `BookingTypeHandler` is keyed by *booking* type and every method takes `unknown`, because its input is raw extraction JSON rehydrated across an Inngest step boundary. Calendar export is keyed by *segment* type, takes a fully typed `Segment` row, and runs at render time. Hotel is also 1→2, so the mapping is not even 1:1.

Rejected: **a `switch` on `segment.type`**. TypeScript's exhaustiveness check would still catch a missing case, but it matches no existing pattern here.

`DaySection` already has `CARD_BY_SEGMENT_TYPE: Record<SegmentType, ComponentType>` — a render-side lookup deliberately separate from the parse-side registry. This follows that precedent. Adding a fifth booking type touches three places (handler, card, calendar), and each omission is a compile error rather than a silent gap.

---

## Architecture

```
lib/itinerary/to-ics.ts                          pure: (calendarName, Segment[]) → string
lib/itinerary/__tests__/to-ics.test.ts
app/(app)/trips/[tripId]/calendar.ics/route.ts   Clerk-authed, ownership-checked
app/demo/calendar.ics/route.ts                   public, env.DEMO_TRIP_ID
```

A directory named `calendar.ics` is a literal App Router path segment, so the URL ends in a real extension — some calendar clients sniff it.

### The trigger

A plain `<a href="calendar.ics">` styled with `buttonVariants`. A download needs no `onClick`, so nothing new ships to the browser and no client component is introduced. Placed beside `AddBookingDialog` in the trip header, and in the `/demo` nav. **Hidden when the trip has no segments** — a button that downloads an empty file is worse than no button.

### Event mapping

| Segment type | Events | SUMMARY |
|---|---|---|
| `flight` | 1 | `ANA NH6 → NRT` |
| `train` | 1 | `JR Central 703 → Kyoto` |
| `hotel_stay` | 2 | `Check in: Park Hyatt Tokyo` / `Check out: Park Hyatt Tokyo` |
| `reservation` | 1 | `Narisawa` |

Flights and trains span `startTime → endTime`. Reservations use `endTime`, which the handler has already filled with the estimate where the document stated none.

**Hotel point events get a 30-minute duration, not zero length.** Zero-length events render inconsistently across clients. Thirty minutes is unambiguous and does not dominate the day view — which is the whole reason the multi-day block was rejected.

Every event carries `LOCATION` from `startLocation`, and `GEO` when both coordinates are present — that is what makes the address tappable into Maps on a phone. `DESCRIPTION` carries confirmation code, seat, terminal, and party size as available.

### Serializer details

The parts that are easy to get subtly wrong, and are therefore what the tests target:

- **CRLF** line endings throughout. RFC 5545 requires them and some clients reject LF-only.
- **Folding at 75 octets, not characters** — continuation lines begin with a single space. A Japanese hotel name breaks a naive character count.
- **Escaping** `\`, `;`, `,` and newline. Not colon — escaping it corrupts values in some parsers.
- **UTC stamps** formatted `YYYYMMDDTHHMMSSZ`.
- **UIDs** `{segmentId}@wayfare.app`, with `-checkin` / `-checkout` suffixes for hotels. Derived from segment ids so re-import updates rather than duplicates.
- **`DTSTAMP` from `segment.updatedAt`**, not the wall clock. It keeps the serializer pure so tests can assert exact output, and it changes when the segment changes — which is precisely what `DTSTAMP` means. `Date.now()` would mark every export as modified.
- **Calendar headers:** `VERSION:2.0`, `PRODID:-//Wayfare//Itinerary//EN`, `CALSCALE:GREGORIAN`, and `X-WR-CALNAME` set to the trip title.

### Response headers

```
Content-Type: text/calendar; charset=utf-8
Content-Disposition: attachment; filename="wayfare-<trip-title-slug>.ics"
```

The slug lowercases the trip title, replaces each run of non-alphanumerics with a single hyphen, and trims leading and trailing hyphens. A title that slugs to nothing — one written entirely in Japanese, for instance — falls back to `itinerary`, so the filename is never `wayfare-.ics`.

**Both routes are dynamic** (`export const dynamic = 'force-dynamic'`). Without it a handler that reads only the database can be statically generated at build time, and the export would then serve a stale snapshot after a booking is added — the same build-time-snapshot behaviour `/demo` has, which is acceptable for a showcase page but wrong for a download whose entire purpose is to be current.

---

## Error handling

- **Authed route:** resolve the Clerk user, load the trip, verify `trip.userId === user.id`. Return `404` for a missing trip *and* for someone else's trip — the existing pages use `notFound()` for both, and matching that avoids leaking which trip ids exist.
- **Unparseable `details`:** a `safeParse` failure falls back to `startLocation` and a generic summary rather than dropping the event. Same principle as `LodgingFooter` — a partially useful event beats a missing one.
- **No segments:** return a valid empty `VCALENDAR` rather than erroring. The button is hidden in this state, so it is only reachable by typing the URL.
- **Demo route with `DEMO_TRIP_ID` unset or the trip missing:** return `404`. Mirrors how `/demo` itself degrades.

---

## Testing

`to-ics.ts` is pure, so it is a full TDD surface, consistent with `lib/itinerary/__tests__/`:

- one case per segment type
- hotel producing two events with distinct UIDs
- the estimated-end notice present when `end_is_estimated`, absent when not
- folding past 75 octets, including multibyte input, to prove octets not characters
- escaping each of `\`, `;`, `,`, newline
- stable UIDs across two calls on the same input
- `GEO` omitted when coordinates are null
- empty segment list producing a valid empty `VCALENDAR`
- CRLF line endings

The two route handlers are auth and IO. `vitest.config.ts` is `environment: 'node'` with no DB harness, so they are manually verified, as every other route in this codebase has been. This is a known and documented gap, not an oversight — a DB harness remains the highest-value testing addition and is tracked in `docs/BACKLOG.md`.

---

## Out of scope

- Subscribable `webcal://` feed — needs the share-link surface. Deferred with it.
- Per-event alarms (`VALARM`) — clients set their own defaults, and a travel app guessing that you want a 30-minute warning before checkout is presumption, not help.
- Importing calendars. Export only.
