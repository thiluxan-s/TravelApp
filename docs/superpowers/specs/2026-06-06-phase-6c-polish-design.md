# Phase 6C — Polish: Failure Modes, Mobile, Accessibility Design Spec

**Date:** 2026-06-06
**Status:** Approved
**Phase doc:** `docs/phases/phase-6-polish.md`

---

## Goal

Verify failure mode UX is already correct, confirm mobile fixes are shipped, and add two targeted accessibility improvements (skip-to-content link, drop zone focus ring).

---

## What we found

### Mobile — already done

Two issues found and fixed during brainstorming (committed to `main`):

| Issue | Fix | Commit |
|---|---|---|
| Map blank on mobile — container had no height below `lg` breakpoint | Added `h-64` to map wrapper in `app/(app)/trips/[tripId]/page.tsx` and `app/demo/page.tsx` | `0679590` |
| White background on `/trips` — `dark` class missing from `<html>` | Added `className="dark"` to `<html>` in `app/layout.tsx` | `255fb49` |

No further mobile work needed — user confirmed everything else looks correct on device.

### Failure modes — already done

The Inngest parse function (`lib/inngest/functions/parse-booking.ts`) already stores user-friendly error messages in `booking.parseError`:

- `"We couldn't identify this document as a flight or hotel booking."`
- `"The AI did not return extraction results."`
- `"The AI extracted data in an unexpected format."`
- `"Something went wrong while parsing your document."`

`BookingCard` already renders these in destructive red text, falling back to `"Couldn't parse this file"` if empty. No retry button needed — user can re-upload the file. No code changes required.

### Alt text — not needed

No `<img>` or `<Image>` tags exist in the codebase. Alt text is a non-issue.

---

## What we're building

Two targeted accessibility fixes.

### 1. Skip-to-content link — `app/layout.tsx`

A visually hidden `<a href="#main-content">` added as the first child of `<body>`. It becomes visible on keyboard focus via `focus:not-sr-only` (or equivalent Tailwind classes). Styled to match the dark design: dark background, amber text.

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:ring-2 focus:ring-ring"
>
  Skip to content
</a>
```

### 2. `id="main-content"` on main element — `app/(app)/layout.tsx`

The `<main>` element in the authenticated app layout gains `id="main-content"` so the skip link has a valid target.

The demo page (`app/demo/page.tsx`) and landing page (`app/page.tsx`) also gain `id="main-content"` on their `<main>` elements for consistency.

### 3. Drop zone focus ring — `components/trips/BookingUploader.tsx`

The file drop zone `<div>` already has `role="button"`, `tabIndex={0}`, and `onKeyDown` — it is keyboard-accessible but has no visible focus indicator.

Add to its `className`:
```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
```

The `rounded-md` class is already present, so the ring follows the border shape.

---

## Modified files

| File | Change |
|---|---|
| `app/layout.tsx` | Add skip-to-content `<a>` as first child of `<body>` |
| `app/(app)/layout.tsx` | Add `id="main-content"` to `<main>` |
| `app/demo/page.tsx` | Add `id="main-content"` to `<main>` |
| `app/page.tsx` | Add `id="main-content"` to `<main>` |
| `components/trips/BookingUploader.tsx` | Add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none` to drop zone className |

---

## Out of scope for 6C

- Retry button on failed bookings (user can re-upload)
- Full WCAG AA audit
- ARIA live regions for parsing status updates
- Color contrast audit (design tokens from shadcn are contrast-compliant by default)
- README rewrite (Phase 6D)
- Demo video (manual screen recording — out of scope for code implementation)
