# Kickoff prompt for Claude Code

Copy-paste this into the first Claude Code session in the empty repo:

---

We're starting a new project called **Wayfare**. It's a travel "second brain" web app — users upload booking confirmation PDFs (flights and hotels), an AI vision model parses them, and the app renders a unified daily itinerary with a map. This is my portfolio piece, built solo on weekends.

I have the **Superpowers**, **Context7**, and **frontend-design** plugins installed. Use them. Brainstorm before coding, plan before implementing, TDD during implementation, Context7 for library docs, frontend-design for UI work. Don't ask permission to use them — they're the workflow.

I've put four reference documents in `docs/` along with a root `CLAUDE.md`. **Before you write any code, read all of these in order:**

1. `CLAUDE.md` — conventions, anti-patterns, who I am, how I work.
2. `docs/PRD.md` — what we're building, who it's for, what's explicitly out of scope.
3. `docs/ARCHITECTURE.md` — system design, data flow, the reasoning behind each choice.
4. `docs/DATA_MODEL.md` — schema with rationale.
5. `docs/phases/phase-1-foundation.md` — exactly what we're doing this weekend.

After reading, before you touch any code, summarize back to me in 5-10 bullets:

- The one-line goal of the project.
- The locked-in tech stack.
- Three conventions from `CLAUDE.md` you'll be especially careful to follow.
- Two anti-patterns you'll specifically avoid.
- The Phase 1 deliverables (high level — you don't need to repeat every step).
- Any contradictions, ambiguities, or things you want me to clarify before starting.

Then wait for me to confirm before you start scaffolding.

---

## After phase 1: starting subsequent phases

For phase 2 and beyond, the kickoff is shorter. Start a fresh session and say:

> We're starting phase N. Read `CLAUDE.md`, then re-skim `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` for any changes since last session, then read `docs/phases/phase-N-*.md` in full. Summarize the phase deliverables and flag anything ambiguous before starting.

This forces re-anchoring on the conventions every session, which matters because Claude Code sessions don't share memory.

## When you hit a decision point mid-phase

If Claude proposes something that contradicts a doc, the doc wins — unless we explicitly decide to update the doc. Don't let convention drift happen silently.

If Claude proposes something the docs don't cover, that's fine — but if it's a meaningful choice (a new library, a new pattern, a new env var), it should be flagged so you can decide consciously and update the doc.
