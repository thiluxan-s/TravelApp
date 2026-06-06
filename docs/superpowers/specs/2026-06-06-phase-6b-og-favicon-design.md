# Phase 6B — OG Image & Favicon: Design Spec

**Date:** 2026-06-06
**Status:** Approved
**Phase doc:** `docs/phases/phase-6-polish.md`

---

## Goal

Make Wayfare link previews look polished when pasted into LinkedIn or Twitter, and show a branded favicon in the browser tab — replacing the default Next.js icon.

---

## Decisions

| Question | Decision |
|---|---|
| Which pages get OG metadata? | All public pages: `/`, `/demo`, `/sign-in`, `/sign-up` |
| Static or dynamic OG image? | Static — one image for all pages, generated at build time |
| OG image design | Dark background (#09090c), amber grid, amber corner accent, "WAYFARE" wordmark + "Your travel second brain." tagline |
| Favicon design | Bold serif "W" in amber (#c4914a) on dark (#09090c) |
| Generation approach | Next.js file conventions (`app/opengraph-image.tsx`, `app/icon.tsx`) — built-in `@vercel/og`, no binary files in git |

---

## What we're building

### 1. OG image — `app/opengraph-image.tsx`

New file at the app root. Next.js automatically uses it as the default `og:image` for every page.

**Size:** 1200×630px (Twitter/LinkedIn standard wide card)

**Design (matches brainstormed Option A):**
- Background: `#09090c`
- Subtle amber grid: `rgba(196,145,74,0.04)` lines at 40px intervals
- Top-left corner accent: 3px × 60px amber bar on each axis, opacity 0.7
- Line 1: `"WAYFARE"` — amber (`#c4914a`), 11px, 600 weight, uppercase, 0.2em letter-spacing
- Line 2: `"Your travel second brain."` — off-white (`#e4ded4`), 56px, 700 weight
- Line 3: `"Upload your bookings. See your trip come together."` — muted (`#5a5550`), 24px

**`alt` export:** `"Wayfare — your travel second brain"`

**Font:** Use `@vercel/og`'s built-in system font (no custom font fetch needed — the sans-serif fallback is sufficient for this design). Do not use `next/font` here; it is not available in the `ImageResponse` context.

### 2. Favicon — `app/icon.tsx`

New file at the app root. Next.js generates the browser tab icon from this, replacing `app/favicon.ico` (which is deleted).

**Size:** 32×32px

**Design:** Bold serif "W" in amber (`#c4914a`) on `#09090c` background. Font size 20px, font weight 800, font family `Georgia, serif`.

### 3. Apple touch icon — `app/apple-icon.tsx`

Same "W" design at 180×180px for iOS home screen icons.

### 4. Root metadata — `app/layout.tsx`

Replace the existing minimal `metadata` export with:

```ts
export const metadata: Metadata = {
  title: {
    default: 'Wayfare',
    template: '%s — Wayfare',
  },
  description: 'Your travel second brain.',
  openGraph: {
    type: 'website',
    siteName: 'Wayfare',
    title: 'Wayfare',
    description: 'Your travel second brain.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wayfare',
    description: 'Your travel second brain.',
  },
};
```

The `title.template` means any page that exports `title: 'Demo'` renders as `"Demo — Wayfare"` in the tab and link preview.

### 5. Per-page metadata

**`app/page.tsx`** — add export:
```ts
export const metadata: Metadata = {
  title: 'Wayfare',
  description: 'Upload your booking PDFs and see your trip come together — flights, hotels, and map in one view.',
};
```

**`app/demo/page.tsx`** — add export:
```ts
export const metadata: Metadata = {
  title: 'Demo',
  description: 'See how Wayfare turns booking confirmations into a unified itinerary. Tokyo, March 2026.',
};
```

Sign-in and sign-up inherit root metadata — no override needed.

---

## New files

| File | Purpose |
|---|---|
| `app/opengraph-image.tsx` | OG image — 1200×630, dark wordmark design |
| `app/icon.tsx` | Favicon — 32×32, amber "W" on dark |
| `app/apple-icon.tsx` | Apple touch icon — 180×180, same design |

## Modified files

| File | Change |
|---|---|
| `app/layout.tsx` | Expand `metadata` with OG + Twitter card defaults |
| `app/page.tsx` | Add page-specific `metadata` export |
| `app/demo/page.tsx` | Add page-specific `metadata` export |

## Deleted files

| File | Reason |
|---|---|
| `app/favicon.ico` | Replaced by `app/icon.tsx` |

---

## Error handling

| Scenario | Behaviour |
|---|---|
| Font unavailable at build time | `@vercel/og` falls back to system sans-serif — image still renders |
| `opengraph-image.tsx` throws | Build fails with a clear error (caught at CI time, not runtime) |

---

## Out of scope for 6B

- Per-trip dynamic OG images (e.g. a custom card for each trip URL) — not a public-facing URL
- OG video
- Structured data / JSON-LD
- README rewrite, demo video (Phase 6C)
