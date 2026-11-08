# 10. Two tracks: Python owns the data step, TypeScript the site

Status: accepted, 2026-11-08. Supersedes the "No Python" sentence of ADR 0001; the rest of 0001 stands.

## Context

Newcomers who know Python had no code of their own in Nest: every stage meant learning Node first. The data side (reading and validating contributor files, counts, the site data, the defect bank) is plain data work that suits Python, and it was already its own layer under the site.

## Decision

Each member has a track, js or python, recorded in their cohort file entry (a plain handle is js). `py/nest_data` is the python track's code and the data step: `nest build-data` writes `site/.nest/data.json`, which the Astro site reads, and CI and the Cloudflare build run it. `@nest/schema` stays as the js track's library, because js members' tests import it and the js track must not need Python; on a machine without Python the site computes the same data with it.

The two libraries are held to one behaviour by goldens recorded from Node (`py/tests/golden`): validation output, the data file's bytes, scaffolds, defect draws and thousands of single-field cases. Commands that exist once (page-status, feed, practice counts, the defect bank) live in nest_data only.

Stages 1, 3, 4 and 5 have a body per track; 2, 6 and 7 are shared. Defects are still planted in the member's own directory (ADR 0004, 0009): each track's scaffold plants from its own bank and writes its own test file, `test_profile.py` or `profile.test.ts`.

## Consequences

- A rule a contributor sees changes in both libraries in one pull request, with the goldens regenerated.
- CI runs a python job, a js job and a site build, behind the one required check, `checks`.
- Shared issues carry `track:js` or `track:python`, so each Stage 5 pool fits its track.
