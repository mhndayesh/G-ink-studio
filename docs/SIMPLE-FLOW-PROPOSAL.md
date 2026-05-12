# Simplified ("Auto") Authoring Flow — Proposal

> Status: **proposal / direction note**, not yet the implemented product. The
> committed studio is the multi-screen, stage-gated flow described in
> [`../WORKFLOW.md`](../WORKFLOW.md) and [`../README.md`](../README.md). An early
> implementation of this proposal lives in `apps/web/app/studio/[storyId]/auto/`
> + `apps/web/lib/autoPilot.ts` and is **experimental**. See
> [`REPO-CRITIQUE.md`](REPO-CRITIQUE.md) §7 ("Product direction") for why these two
> designs need to be reconciled.

## Goal

The target user is an **average person who wants to make a story**, not a
professional writer. The number-one priority is **minimizing the steps the user
has to take**. The current 6-stage / ~19-screen studio is the opposite of that.

## Proposed user-facing flow

Each arrow is **one** user action (one button, one loading state). Behind it the
backend may run many LLM calls and loops, but the UI shows a single step:

1. **Idea** → AI expansion → **World brief**
2. **Characters brief** → **character visuals**
3. **Arc brief** → **places + other visuals**
4. **How many chapters** → chapter generation
5. **Scenes + dialogue**
6. **Export**

So, e.g., "characters brief → character visuals" is one UI step; the backend does
the multi-pass work. "Idea → AI expansion → world brief" is likewise one UI step.

## Principle

> The LLM fills the story JSON in real time, not gated stage-by-stage. The user
> confirms; the system does the work. Fewer screens, fewer loading events, fewer
> decisions surfaced to the user.

## Open questions before adopting this

- Keep both flows (power vs. simple) or replace the staged studio?
- Where does "LLM proposes, user confirms" live in a one-shot step — a single
  review screen at the end of each macro-step?
- How do the existing per-screen AI gates map onto macro-steps?
- What happens to the ~19 committed studio screens if this becomes the default?
