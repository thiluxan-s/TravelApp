# Phase 6 — Polish, Demo, Ship

**Goal:** The app feels finished. README sells it. Deployed. Demo trip pre-seeded.

**Prerequisite:** Phase 5 complete.

## Deliverables (high level)

1. **Landing page polish.** Hero, screenshot/video of the itinerary, "Try the demo" button that signs into a demo account and shows a pre-seeded trip.
2. **Demo seed.** Script + production seed that creates a "Tokyo March 2026" trip with parsed flight (Toronto→Tokyo→Toronto) and hotel (3-night stay) so a recruiter doesn't have to upload anything to see the value.
3. **Loading and empty states everywhere.** Audit every screen for empty, loading, and error states.
4. **Mobile pass.** Walk through every screen on a phone. Fix anything broken or cramped.
5. **Failure modes.** Upload a non-booking PDF, a corrupt PDF, a foreign-language PDF — confirm the failure UX is helpful, not alarming.
6. **README rewrite.** Architecture diagram, screenshots, design decisions, "what I'd build next" roadmap, live demo link.
7. **Demo video.** A 60-90 second screen recording showing sign-in → upload → itinerary. Embed in the README.
8. **OG image and favicon.** Custom OG image so the link previews well on LinkedIn / Twitter.
9. **Accessibility pass.** Keyboard nav, focus states, alt text, color contrast.
10. **Final deploy.** Custom domain if I want one.

## Notes for when we get here

- A potential gotcha with the demo account: Clerk shouldn't allow the "demo" user to actually edit anything, otherwise visitors will trash it. Either make it a read-only viewer mode or reset the demo trip nightly via a cron.
- The README is the most-read artifact in the project. Spend real time on it.

---

(More detail to be added before starting this phase.)
