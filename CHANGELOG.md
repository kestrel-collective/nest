# Changelog

All notable changes to Nest. The format follows Keep a Changelog, the versions follow semantic versioning. Contributors are credited by handle.

## Unreleased

### Fixed

- Shared-pool issues are opened with `stage:5` as well as `good-shared-issue` and their track label, by `scripts/open-backlog.mjs` and by the shared-issue form. The Onboarding upkeep reports, and fails on, any open `good-shared-issue` without `stage:5`.

### Changed

- The site follows design scope v1, the logo palette: the Kestrel Collective wordmark in the header, new tokens with the first brand sheet behind `data-palette="classic"`, a stepper ladder, person and stat cards, and a 404 with numerals (docs/adr/0008-visual-system-v2.md).
- Every stage issue, the contributing guide, the pull request template and the directory template were rewritten for a first-time contributor, following the Kestrel default curriculum.

### Added

- The python track (ADR 0010). `py/nest_data` reads and validates every contributor and cohort file with the same rules and messages as `@nest/schema`, and writes `site/.nest/data.json`, which the site now reads; CI and the Cloudflare build run it as the data step. Goldens recorded from the Node code hold both libraries to the same output.
- Tracks: a cohort member is a handle (js) or a handle with `track: python`. `nest enroll --track`, a track input on the Enrol workflow, and a `track:` label on every stage issue.
- Stages 1, 3, 4 and 5 have a body per track; the python Stage 1 needs no Node. Stages 2, 6 and 7 are shared, with each track's commands filled in.
- `nest scaffold` for python-track members, with `test_profile.py` and the five tier-1 defects ported; the defect bank commands for both tracks, with a python candidate prompt.
- CI runs a python job (ruff and pytest on 3.11 and 3.13), a js job and a site build behind the one `checks` gate. Every shared issue in the backlog names its track, and five python starter issues are added.
- `nest enroll`, the Enrol and Onboarding workflows, and docs/ENROLMENT.md.
- `nest page-status <handle>` (in `py/` since ADR 0010): whether the site would build a person's page from `main`, with the feed, cohort page and home page entries, the URL, and what is in the way.
- A test that builds the real site from a fixture with one public and one private profile, and one that checks an invalid public profile stops the build with the file, line and field.

## 0.1.0, 2026-10-24

The ladder exists. First release, built from the design in `docs/design/` and the build log in `docs/BUILD-LOG.md`.

### Added

- `packages/schema`: schemas for `profile.yml`, `page.md`, `cohort.yml` and `.practice.json`, a handle rule that keeps template directories private, and validation messages that name the file, the line, the field and what to change.
- `packages/cli`, the `nest` command: `validate`, `scaffold` (with one planted defect per directory), `new-task`, `feed` and `open-cohort` (idempotent, dry-run, prints bodies without `--gh`).
- `site`: the Astro site with its zero-pages state, contributor pages, cohort pages, a 404 and the pages feed at `/api/pages.json`.
- `contributors/_example/`, the template every directory is made from, and `CONTRIBUTORS.md` for Stage 1.
- `stages/`: issue bodies for the seven stages of the ladder.
- GitHub configuration as code: CI, auto-merge for own-directory pull requests, nightly practice counts, label sync, templates, CODEOWNERS and `docs/REPO-SETTINGS.md`.
- Documentation: contributing guide for a first pull request, seven architecture decision records, privacy, governance, roadmap, feed contract, and a ten-issue Stage 5 backlog seed.

### Contributors

- @Nyakachess
