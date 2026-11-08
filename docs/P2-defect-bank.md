# P2: the Nest defect bank

Copied from the Kestrel repository's `docs/kestrel-ai-patterns-plan.md`, section P2, on 2026-10-26, so this repository holds the plan it implements. Section 0 of that plan (model output is a suggestion a person reviews; provenance on every asset) applies; in Kestrel it is decision D-39.

The plan names the new decision record ADR 0008. That number was taken by the visual system record, so the defect bank is [ADR 0009](adr/0009-defect-bank-in-three-tiers.md). The commands are `nest defect-request`, `nest defect-import`, `nest defect-check` and `nest defect-promote`.

Since [ADR 0010](adr/0010-two-tracks.md) the bank has two tracks, and the four commands run from `py/` (`nest_data/defect_bank.py`) for both:

- A round's slots alternate js and python, or `--track` picks one. A js slot uses the prompt `tools/defect-bank/nest_defect_v1.md` with the TypeScript files as context; a python slot uses `nest_defect_python_v1.md` with nest_data's files.
- A python candidate is a module defining `DEFECT` and a pytest test, in `py/nest_data/defects/candidates/`. Import, the gate and promotion are all in nest_data, and promoted python defects are listed in `py/nest_data/defects/bank.py`.
- A js candidate is still a TypeScript module and a vitest test in `packages/cli/src/defects/candidates/`. Only Node can load those, so the commands hand them to `packages/cli/dist/defect-bank/js-entry.js`, which runs the js track's gate and promotion in `packages/cli/src/defect-bank/` (build it with `npx tsc -b` first).
- Numbers count from 6 across both tracks, so a number names one defect. The five tier-1 defects exist on both tracks, with detectors that say the same sentences.
- Each track's scaffold plants from its own bank, and both read and write the cohort's `.defects.json`, so one cohort's members spread over different defects whatever their track.

## The plan text

**Why.** Every Nest scaffold plants one of five defects, chosen from the handle
(ADR 0004, `packages/cli/src/defects.ts`). With five, contributors in one cohort compare
notes and the Stage 3 search turns into copying. A bank of about twenty, spread over
difficulty, keeps Stage 3 a real investigation for every cohort, indefinitely.

**The model writes candidates, not merges.** For each candidate defect the model
produces the same shape as the existing five: `id`, `symptom` (what the owner sees on the
live page), `apply` (a change to the scaffold plan), `detect` (one sentence naming the
problem, or null), a Vitest test that fails with the defect and passes without it, plus
a difficulty tier and the competency it exercises. The prompt carries ADR 0004's rules:
the defect passes `nest validate`, is visible on the live page, and sits only in fields
the scaffold pre-fills so Stage 2 edits do not erase it.

**Model.** Opus 5.5, with the schema package, `templates.ts`, `defects.ts` and ADR 0004
as context. About 40 candidates in two rounds; roughly 5 to 8 USD.

**Review and merge.** A maintainer runs each candidate through the existing gate: the
detector and the test in the same change (ADR 0004's consequence), CI green, the defect
visible on a built page. Expected keep rate about half. Kept defects get numbers 6 and
up. A new ADR (0008, "a bank of planted defects in three tiers") records the tiers and
how a defect is chosen: from the handle as today, within the tier the cohort's stage
plan asks for, never the same defect twice in one cohort when the bank allows it.

**Done when.**

- About 20 defects in the bank, each with a detector and a test, all passing
  `nest validate` and visible on the page.
- `nest enroll` spreads a cohort of 15 across at least 10 different defects (a test).
- The Stage 3 and 4 issue templates are unchanged: they say a defect exists, not which.
