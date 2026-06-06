# Phase 6C Polish — Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a skip-to-content keyboard link and a focus-visible ring on the upload drop zone — two targeted accessibility improvements.

**Architecture:** Both changes are pure UI/styling — no logic, no data, no new dependencies. Task 1 threads a skip link through four files. Task 2 adds three Tailwind classes to one element.

**Tech Stack:** Tailwind CSS (sr-only, focus-visible utilities), Next.js App Router layouts

---

### Task 1: Skip-to-content link + `id="main-content"` targets

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `app/demo/page.tsx`
- Modify: `app/page.tsx`

Note: These are accessibility/styling changes with no unit-testable logic. Verification is manual keyboard navigation.

- [ ] **Step 1: Verify the problem — tab through the landing page and notice there is no skip link**

Open the app in a browser. Press Tab on the landing page. Observe that focus goes directly into nav links with no way to skip past them. This is the baseline we're fixing.

- [ ] **Step 2: Add the skip-to-content link to `app/layout.tsx`**

The link must be the first focusable element in `<body>` — before `{children}` and before `<Toaster />`. The `sr-only` class hides it visually; `focus:not-sr-only` reveals it only when keyboard-focused.

Current `<body>` in `app/layout.tsx` (line 36–39):
```tsx
<body>
  {children}
  <Toaster />
</body>
```

Replace with:
```tsx
<body>
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:ring-2 focus:ring-ring"
  >
    Skip to content
  </a>
  {children}
  <Toaster />
</body>
```

- [ ] **Step 3: Add `id="main-content"` to the authenticated app layout**

In `app/(app)/layout.tsx` (line 36), the `<main>` element is the skip link target for all authenticated pages:

```tsx
<main className="max-w-6xl mx-auto px-4 py-8" id="main-content">{children}</main>
```

- [ ] **Step 4: Add `id="main-content"` to the demo page**

In `app/demo/page.tsx` (line 47), the `<main>` element:

```tsx
<main className="mx-auto max-w-6xl px-4 py-8" id="main-content">
```

- [ ] **Step 5: Add `id="main-content"` to the landing page**

In `app/page.tsx` (line 227–229), the `<main>` element:

```tsx
<main
  className="relative z-10 flex-1 flex items-center"
  id="main-content"
  style={{ padding: '3rem 2.5rem 4rem' }}
>
```

- [ ] **Step 6: Smoke test**

Run `npm run dev`. Open the landing page. Press Tab once. The "Skip to content" link should appear visually in the top-left corner (dark background, foreground text, amber ring). Press Enter — focus should jump to the hero section content. Also test on `/demo` and a trip detail page (once signed in).

- [ ] **Step 7: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/layout.tsx app/(app)/layout.tsx app/demo/page.tsx app/page.tsx
git commit -m "$(cat <<'EOF'
feat: add skip-to-content link and main-content targets for keyboard nav

Keyboard users had no way to bypass the nav on each page. The skip link
appears on Tab focus and jumps to #main-content, which is now set on the
<main> element in all four page layouts.
EOF
)"
```

---

### Task 2: Focus-visible ring on the upload drop zone

**Files:**
- Modify: `components/trips/BookingUploader.tsx`

- [ ] **Step 1: Verify the problem**

Open the upload dialog (or the booking uploader). Tab to the drop zone. Observe that it receives focus (browsers show a default outline or nothing) but has no styled ring matching the app's design system. The element has `role="button"` and `tabIndex={0}` so it is focusable, just unstyled.

- [ ] **Step 2: Add the focus-visible ring classes**

In `components/trips/BookingUploader.tsx` at line 163–167, the drop zone `<div>` has a conditional `className`. Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` to the base class string (outside the conditional — it applies in all drag states).

Current className:
```tsx
className={`border border-dashed rounded-md px-4 py-5 text-center cursor-pointer transition-colors ${
  isDragOver
    ? 'border-foreground/50 bg-muted/50'
    : 'border-border hover:border-foreground/30 hover:bg-muted/20'
}`}
```

Replace with:
```tsx
className={`border border-dashed rounded-md px-4 py-5 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
  isDragOver
    ? 'border-foreground/50 bg-muted/50'
    : 'border-border hover:border-foreground/30 hover:bg-muted/20'
}`}
```

The `rounded-md` already present ensures the ring follows the border radius.

- [ ] **Step 3: Smoke test**

Open the add booking dialog. Tab to the drop zone. Observe the `ring-ring` styled ring (amber) appearing around the element when it is keyboard-focused. Click elsewhere to confirm the ring disappears on blur. Mouse hover should not show the ring (that is the point of `focus-visible` vs `focus`).

- [ ] **Step 4: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/trips/BookingUploader.tsx
git commit -m "$(cat <<'EOF'
feat: add focus-visible ring to upload drop zone

The drop zone had role="button" and tabIndex={0} but no visible focus
indicator for keyboard users. Adding focus-visible ring classes makes
keyboard navigation through the upload UI visible and on-brand.
EOF
)"
```
