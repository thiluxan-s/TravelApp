# Phase 6B — OG Image & Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished OG image and favicon so Wayfare link previews look professional on LinkedIn/Twitter and the browser tab shows a branded icon.

**Architecture:** Three new Next.js file-convention files (`app/opengraph-image.tsx`, `app/icon.tsx`, `app/apple-icon.tsx`) use `ImageResponse` from `next/og` to generate images at build time. Root metadata in `app/layout.tsx` is expanded with OpenGraph and Twitter card defaults. Two public pages (`/` and `/demo`) get page-specific metadata overrides. The existing `app/favicon.ico` is deleted so `app/icon.tsx` takes over as the browser tab icon.

**Tech Stack:** Next.js 16 App Router, `next/og` (`ImageResponse`), TypeScript

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app/opengraph-image.tsx` | Create | 1200×630 OG image — dark wordmark design |
| `app/icon.tsx` | Create | 32×32 favicon — amber "W" on dark |
| `app/apple-icon.tsx` | Create | 180×180 Apple touch icon — same design |
| `app/favicon.ico` | Delete | Replaced by `app/icon.tsx` |
| `app/layout.tsx` | Modify | Add OG + Twitter card root metadata |
| `app/page.tsx` | Modify | Add page-specific metadata export |
| `app/demo/page.tsx` | Modify | Add page-specific metadata export |

---

## Task 1: OG image

**Files:**
- Create: `app/opengraph-image.tsx`

There are no unit tests for `ImageResponse` files — verification is a smoke test (Step 3).

- [ ] **Step 1: Create `app/opengraph-image.tsx`**

```tsx
import { ImageResponse } from 'next/og';

export const alt = 'Wayfare — your travel second brain';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090c',
          position: 'relative',
        }}
      >
        {/* Subtle amber grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(196,145,74,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(196,145,74,0.04) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Top-left corner accent */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 3,
            height: 60,
            background: '#c4914a',
            opacity: 0.7,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 60,
            height: 3,
            background: '#c4914a',
            opacity: 0.7,
          }}
        />
        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '0 96px',
            position: 'relative',
          }}
        >
          <div
            style={{
              color: '#c4914a',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}
          >
            ✦ Wayfare
          </div>
          <div
            style={{
              color: '#e4ded4',
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.15,
              marginBottom: 20,
            }}
          >
            Your travel second brain.
          </div>
          <div
            style={{
              color: '#5a5550',
              fontSize: 24,
              letterSpacing: '0.02em',
            }}
          >
            Upload your bookings. See your trip come together.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Smoke test — verify the image renders**

Start the dev server if not already running:

```bash
npm run dev
```

Visit: `http://localhost:3000/opengraph-image`

Expected: a 1200×630 dark image with amber "✦ Wayfare" label, "Your travel second brain." in off-white, and muted subtext. No error page.

- [ ] **Step 4: Commit**

```bash
git add app/opengraph-image.tsx
git commit -m "feat: add OG image for social link previews"
```

---

## Task 2: Favicon and Apple touch icon

**Files:**
- Create: `app/icon.tsx`
- Create: `app/apple-icon.tsx`
- Delete: `app/favicon.ico`

The existing `app/favicon.ico` must be deleted — if it coexists with `app/icon.tsx`, Next.js serves the `.ico` file for the browser tab and `icon.tsx` is ignored for favicon purposes.

- [ ] **Step 1: Delete `app/favicon.ico`**

```bash
git rm app/favicon.ico
```

- [ ] **Step 2: Create `app/icon.tsx`**

```tsx
import { ImageResponse } from 'next/og';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090c',
        }}
      >
        <div
          style={{
            color: '#c4914a',
            fontSize: 20,
            fontWeight: 800,
            fontFamily: 'Georgia, serif',
            lineHeight: 1,
          }}
        >
          W
        </div>
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 3: Create `app/apple-icon.tsx`**

```tsx
import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090c',
        }}
      >
        <div
          style={{
            color: '#c4914a',
            fontSize: 112,
            fontWeight: 800,
            fontFamily: 'Georgia, serif',
            lineHeight: 1,
          }}
        >
          W
        </div>
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Smoke test — verify favicon in browser tab**

With dev server running, visit `http://localhost:3000`. Check the browser tab — it should show the amber "W" icon instead of the Next.js default.

Also verify directly: `http://localhost:3000/icon` — should render the 32×32 "W" image.

- [ ] **Step 6: Commit**

```bash
git add app/icon.tsx app/apple-icon.tsx
git commit -m "feat: add branded favicon and Apple touch icon"
```

---

## Task 3: Root metadata

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update `app/layout.tsx`**

The current file:

```tsx
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wayfare',
  description: 'Your travel second brain',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
```

Replace the `metadata` export with:

```tsx
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

Keep all other imports and the `RootLayout` function unchanged.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Smoke test — verify OG tags in page source**

With dev server running, visit `http://localhost:3000` and view page source (Cmd+U / Ctrl+U). Search for `og:image` — you should see a meta tag pointing to `/opengraph-image`. Search for `twitter:card` — should be `summary_large_image`.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: add OpenGraph and Twitter card root metadata"
```

---

## Task 4: Per-page metadata

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/demo/page.tsx`

- [ ] **Step 1: Add metadata to `app/page.tsx`**

Add this import at the top of `app/page.tsx` (after the existing imports):

```tsx
import type { Metadata } from 'next';
```

Then add this export immediately before the `export default function LandingPage()` line:

```tsx
export const metadata: Metadata = {
  title: 'Wayfare',
  description:
    'Upload your booking PDFs and see your trip come together — flights, hotels, and map in one view.',
};
```

- [ ] **Step 2: Add metadata to `app/demo/page.tsx`**

Add this import at the top of `app/demo/page.tsx` (after the existing imports):

```tsx
import type { Metadata } from 'next';
```

Then add this export immediately before the `export default async function DemoPage()` line:

```tsx
export const metadata: Metadata = {
  title: 'Demo',
  description:
    'See how Wayfare turns booking confirmations into a unified itinerary. Tokyo, March 2026.',
};
```

The `title: 'Demo'` will render as `"Demo — Wayfare"` in the tab and link previews, thanks to the `template: '%s — Wayfare'` set in root metadata.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Smoke test — verify per-page titles**

With dev server running:

1. Visit `http://localhost:3000` — browser tab should read "Wayfare"
2. Visit `http://localhost:3000/demo` — browser tab should read "Demo — Wayfare"

View source on `/demo` and check:
- `<title>Demo — Wayfare</title>`
- `<meta property="og:description" content="See how Wayfare turns booking confirmations into a unified itinerary. Tokyo, March 2026." />`

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/demo/page.tsx
git commit -m "feat: add per-page metadata for landing and demo routes"
```

---

## Task 5: Final verification

No code changes — this is a cross-cutting smoke test before shipping.

- [ ] **Step 1: Run tests**

```bash
npm test
```

Expected: 17/17 passing.

- [ ] **Step 2: Full OG verification**

With dev server running, verify each public URL:

| URL | Expected `<title>` | Expected `og:description` |
|---|---|---|
| `http://localhost:3000/` | Wayfare | "Upload your booking PDFs…" |
| `http://localhost:3000/demo` | Demo — Wayfare | "See how Wayfare turns booking confirmations…" |
| `http://localhost:3000/sign-in` | Wayfare | "Your travel second brain." |
| `http://localhost:3000/sign-up` | Wayfare | "Your travel second brain." |

Verify `og:image` resolves: open `http://localhost:3000/opengraph-image` directly — should show the dark wordmark image, not a 404.

- [ ] **Step 3: Verify favicon**

Check the browser tab on all four pages — should show the amber "W" icon consistently.
