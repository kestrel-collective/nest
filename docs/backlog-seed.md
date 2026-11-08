# Stage 5 backlog seed

Issues for the `good-shared-issue` pool, each a gap found while building this repository, not invented for practice. Open them with `node scripts/open-backlog.mjs --gh` (without `--gh` it only lists them). Each follows the stage issue format: why, steps, done when.

Each issue names its track on a `Track:` line under its title (ADR 0010). The script labels every issue `good-shared-issue` and `stage:5`, and `track:js` or `track:python`, which is how Stage 5 sends each member to their own pool. The Onboarding upkeep reports any open `good-shared-issue` without `stage:5`. `--track python` opens one track's issues only. A python issue's code is in `py/nest_data`; a js issue's is in the site, `packages/` or the workflows.

## Count merged pull requests without one API call per pull request

Track: python

### Why

`gather` in `py/nest_data/practice.py`, which `nest practice-counts` runs every night, lists every merged pull request and then fetches the file list of each one, so a repository with 300 merged pull requests makes 300 extra calls every night. It works today and will not scale to the second cohort.

### Steps

1. Read `gather` and `compute_practice` in `py/nest_data/practice.py`. Note that `compute_practice` only needs, per pull request, the author and whether its files were all inside one contributor directory or touched anything outside `contributors/`.
2. Replace the per-pull-request file fetch with a cached summary: keep `.github/practice-cache.json` mapping pull request number to `{ author, kind }`, read it first, and fetch files only for numbers not in the cache. Commit the cache in the same workflow commit.
3. Keep `compute_practice` unchanged; adapt only the data gathering. Add a test in `py/tests/test_counts.py` for the cache merge logic (new numbers fetched, known numbers skipped), with the GitHub calls replaced by a fake.
4. Run the workflow with `workflow_dispatch` on a fork or test repository and confirm the second run makes no file calls.

### Done when

- [ ] A second run of the workflow with no new merges makes zero `pulls/{n}/files` calls.
- [ ] The cache file is documented in `docs/adr/0002-counts-from-committed-files.md` or a new record.
- [ ] Tests cover the merge of cached and fresh entries.

## Make nest validate check the stage files

Track: python

### Why

`nest new-task` fails only when it is called if a `stages/0N-*.md` file is missing or a placeholder is misspelt (`{{hanlde}}` renders as literal text). `nest validate` should catch that in CI, before a cohort is opened.

### Steps

1. In `py/nest_data`, add a `validate_stages(root)` that checks every stage number 1 to 7 has a body (a shared `0N-<slug>.md`, or both `0N-<slug>.js.md` and `0N-<slug>.python.md`) and that every `{{name}}` placeholder in them is one of the known names listed in `stages/README.md`.
2. Call it from `run_validate` in `py/nest_data/cli.py`, not from `validate_repo`, so the site data and the parity goldens stay as they are, and print its issues in the normal form, with the file and line of any unknown placeholder.
3. Add tests in `py/tests` with a temp directory: a missing stage file, a stage with only one track's body, an unknown placeholder, and a clean set.

### Done when

- [ ] `nest validate` fails with a file, line and sentence when a stage file is missing or uses an unknown placeholder.
- [ ] The CI job catches it on a pull request that renames a stage file.

## Numbered lists in contributor pages

Track: js

### Why

`site/src/lib/markdown.ts` renders paragraphs, bullet lists, links, bold, italics and code. A numbered list written as `1.` lines becomes one paragraph. Owners writing "what I learned" as steps hit this immediately.

### Steps

1. Read `renderMarkdown` and its test in `site/src/lib/markdown.test.ts`.
2. Add ordered lists: a block where every line matches `^\s*\d+[.)]\s+` becomes `<ol>` with one `<li>` per line, inline formatting applied.
3. Add tests for an ordered list, a bullet list and a paragraph that merely starts with a number followed by text.

### Done when

- [ ] A section with `1.`, `2.`, `3.` lines renders as an ordered list on the page.
- [ ] Existing tests still pass and the new ones cover the three cases above.

## Auto-merge the Stage 1 pull request

Track: js

### Why

The auto-merge workflow accepts only changes inside the author's own directory. Stage 1 adds one line to `CONTRIBUTORS.md`, so every Stage 1 pull request waits for a maintainer, which is the slowest moment for a first contributor.

### Steps

1. Read `checkOwnDirectoryChange` in `packages/cli/src/paths.ts` and its test. It receives file paths only.
2. Extend the check with an optional patch: when the only changed file is `CONTRIBUTORS.md`, fetch its diff (the API returns a `patch` field per file) and accept it if the diff is exactly one added line equal to `- @<author>` (case-insensitive) and nothing removed.
3. Keep the function pure: pass the patch text in, decide, return a reason. Update `.github/scripts/check-own-dir.mjs` to request `filename` and `patch`.
4. Tests: the exact line, a line for someone else, a line plus any other change, a removed line.

### Done when

- [ ] A pull request that adds only `- @author` to `CONTRIBUTORS.md` is auto-merged once CI is green.
- [ ] Any other change to that file still goes to a maintainer, with the reason printed.

## Resume open-cohort after a failed scaffold push

Track: js

### Why

`nest open-cohort --gh` scaffolds a member, creates a branch, pushes and opens a draft pull request, one member at a time. If the push or the `gh pr create` call fails, the local branch and commit remain, the command stops, and a second run reports the directory as existing (on that branch) or opens nothing because `findPr` finds no pull request.

### Steps

1. Read `createDraftPr` in `packages/cli/src/gh.ts` and `openCohort` in `packages/cli/src/commands/open-cohort.ts`.
2. On failure after the branch is created, delete the local branch and restore the original branch before rethrowing, so a re-run starts clean.
3. If the branch exists on the remote but no pull request does, open the pull request from the existing branch instead of scaffolding again.
4. Add tests with the fake gh client: a failure in `createDraftPr` leaves no partial state in the report, and a remote branch without a pull request gets one.

### Done when

- [ ] After an interrupted run, a second `nest open-cohort <id> --gh` completes with no duplicate branches or pull requests.
- [ ] The tests above pass.

## Show when the counts were last updated

Track: js

### Why

Every contributor page says "updated after merges" next to the contributions card, but never says when. `.practice.json` carries `updated_at`, and a contributor who just merged a pull request has no way to tell whether the nightly run has happened.

### Steps

1. Read `site/src/pages/p/[handle]/index.astro`, the contributions card, and `site/src/lib/format.ts`.
2. Replace the static "updated after merges" with "counts updated <date>" using `formatDate` on `c.practice.updated_at`, and "no counts yet" when the file is missing (the schema fills `EMPTY_PRACTICE` whose timestamp is the Unix epoch; treat that as missing).
3. Add a test in `site/src/lib` for the small helper that turns a practice record into that label.

### Done when

- [ ] A page with counts shows the date they were computed; a page without shows "no counts yet".
- [ ] The epoch timestamp never appears on a page.

## Cohort metrics from the design

Track: python

### Why

The cohort page in `docs/design/nest-cohort.html` shows "First PR merged", "median days from joining", "Moved to external repos" and "Proposals shipped". The page today shows what the data allows: pages published, stages completed, shared pull requests and external contributions. The first set needs dates the counts file does not have.

### Steps

1. Extend the practice record with optional `first_pr_merged_at` (ISO date) and `proposals_accepted` (integer), keeping old files valid: `PRACTICE` in `py/nest_data/schema.py`, and `PracticeSchema` in `packages/schema/src/practice.ts`, since both tracks read it (regenerate the goldens as `py/tests/fixtures/README.md` says).
2. In `compute_practice` in `py/nest_data/practice.py`, compute `first_pr_merged_at` from the earliest merged pull request by the owner and `proposals_accepted` from closed issues labelled `proposal` and `accepted` assigned to the owner. Test both in `py/tests/test_counts.py`.
3. In `site/src/lib/data.ts`, add to `summarize` the count of members whose first pull request merged, the median days from `joined` to `first_pr_merged_at`, and the count with at least one external project. Render them on the cohort page in the four stat cards.

### Done when

- [ ] Old `.practice.json` files still validate.
- [ ] The cohort page shows the four metrics from the design, with "no data yet" where nothing has merged.
- [ ] Tests cover the median with an odd and an even number of members.

## A maintainer command that runs the defect detectors

Track: python

### Why

Stage 3's issue promises "a narrower place to look, not the answer". The detectors for the planted defects exist in `py/nest_data/defects/` but there is no command that runs them, so a maintainer has to write a script to check whether a contributor's fix is right.

### Steps

1. Add `nest check-defect <handle>` in `py/nest_data/commands/`: validate the directory, load its cohort, run `detect_defects`, print one line per finding or "no planted defect found", exit 1 when a finding remains. Register it in `commands/__init__.py`.
2. Add a `--hint` flag that prints only the first finding's file name (profile.yml or page.md), for the "narrower place" reply.
3. Tests in `py/tests` with a temp repository: a scaffold with each defect reports exactly its own finding, and a fixed one reports nothing.

### Done when

- [ ] `nest check-defect <handle>` works on a checkout and is documented in `docs/CONTRIBUTING.md` under a maintainers heading.
- [ ] Tests for all five defects and the clean case pass.

## Format Astro files with prettier

Track: js

### Why

`.prettierignore` excludes `*.astro` because prettier has no parser for them without a plugin. The site's components are therefore the only files in the repository that `npm run format` does not touch, and reviews of them spend time on spacing.

### Steps

1. Add `prettier-plugin-astro` as a root dev dependency and list it under `plugins` in `.prettierrc`.
2. Remove `*.astro` from `.prettierignore`, run `npm run format`, and review the diff: it must be whitespace only.
3. Confirm `npm run lint` passes and that CI still runs on Node 20.

### Done when

- [ ] `npm run lint` checks `.astro` files.
- [ ] The formatting commit changes no rendered output (compare `site/dist` before and after with a diff).

## Screenshots of the site in the repository

Track: js

### Why

The screenshots in `docs/screenshots/` were produced with a script that lives outside the repository. Nobody can regenerate them after a change, and pull requests that touch the site show no picture of what changed.

### Steps

1. Add `scripts/screenshots.mjs` that builds the site, serves `site/dist` on a local port, and captures the home, a contributor page, the cohorts page, a cohort page and the 404 at 1280 and 390 pixels. Use `puppeteer-core` as an optional dev dependency and find Chrome through the `CHROME_PATH` environment variable or the usual locations.
2. Document the command in `docs/CONTRIBUTING.md` under a maintainers heading, including that it needs a fixture contributor in a temp copy, never in the tree.
3. Add a workflow job, manual only (`workflow_dispatch`), that runs it on Ubuntu with the Chrome that `actions/setup-chrome` provides and uploads the images as an artifact.

### Done when

- [ ] `node scripts/screenshots.mjs` regenerates every file in `docs/screenshots/` on a maintainer's machine.
- [ ] The manual workflow produces the same set as an artifact.

## Withdrawn stage issues count as stages done

Track: python

### Why

`nest withdraw` closes a person's open stage issues as "not planned" when they leave a cohort. `compute_practice` in `py/nest_data/practice.py` counts every closed onboarding issue with a `stage:n` label as a stage done, so a withdrawn member's page claims stages they never did, and a member who rejoins starts with stages already ticked.

### Steps

1. Read `gather` and `compute_practice` in `py/nest_data/practice.py`, and `closeIssueNotPlanned` in `packages/cli/src/gh-cli.ts` to see how a withdrawal closes an issue.
2. Write the failing test first in `py/tests/test_counts.py`: a closed issue with `stage:3` whose `state_reason` is `not_planned` must not add stage 3.
3. Add `state_reason` to `ClosedIssue`, fetch it in `gather` (it is a field of every issue in the GitHub API), and skip `not_planned` issues in `compute_practice`.

### Done when

- [ ] A stage issue closed as not planned no longer counts; one closed as completed still does.
- [ ] The test fails without the change and passes with it.
- [ ] `ruff check py` and `pytest` pass.

## Name a missing homepage or version in package.json

Track: python

### Why

`read_config` in `py/nest_data/config.py` reads the repository's `package.json`. When `homepage` is missing, every page address in the feed and in `nest page-status` silently becomes `/p/<handle>/` with no site in front of it, and a missing `version` silently becomes `0.0.0`. Both are mistakes someone should be told about, in one sentence, before anything is written.

### Steps

1. Read `read_config` and the `UsageError` it already raises for a bad `repository` field.
2. Write the tests first in `py/tests/test_cli.py`: a `package.json` without `homepage`, and one without `version`, each make `nest build-data` exit 2 with a sentence that names the field and says what it should look like.
3. Raise a `UsageError` for each, in the same style as the repository one.

### Done when

- [ ] Each missing field is named in a plain sentence, with an example value.
- [ ] The real repository's `package.json` still reads without problems.
- [ ] `ruff check py` and `pytest` pass.

## Refuse to scaffold into a cohort that has no cohort file

Track: python

### Why

`nest scaffold <handle> --cohort 2027-05` on the python track writes a profile with `cohort: 2027-05` even when `cohorts/2027-05/cohort.yml` does not exist. The scaffold then fails `nest validate` later, with a message about the profile, far from the real cause: the cohort id was wrong, or the cohort was never opened.

### Steps

1. Read `_resolve_cohort` and `plan_scaffold` in `py/nest_data/scaffold.py`.
2. Write the failing test first in `py/tests/test_scaffold.py`: scaffolding into an unknown cohort raises a `UsageError` that names `cohorts/<id>/cohort.yml` and lists the cohorts that do exist.
3. Raise it in `_resolve_cohort`, and keep `--cohort none` working for an individual joiner.

### Done when

- [ ] An unknown cohort is refused before anything is written, with the file and the known cohorts named.
- [ ] The existing scaffold tests still pass, including the parity cases.
- [ ] `ruff check py` and `pytest` pass.

## Explain a missing or signed-out GitHub CLI in nest practice-counts

Track: python

### Why

`nest practice-counts` calls the GitHub CLI. Run on a machine without `gh`, or with `gh` not signed in, it stops with a Python traceback from `subprocess`. A maintainer trying it locally, or a contributor reading the workflow, should get one sentence that says what is missing and how to fix it.

### Steps

1. Read `gather` in `py/nest_data/practice.py` and `run` in `py/nest_data/commands/practice_counts.py`.
2. Write the tests first in `py/tests/test_counts.py`, with `subprocess.run` replaced by a fake: `gh` not found, and `gh` failing with "not logged in", each exit 2 with a plain sentence and no traceback.
3. Catch `FileNotFoundError` and `subprocess.CalledProcessError` around the calls and raise a `UsageError` with the sentence.

### Done when

- [ ] Both cases print one sentence that names the problem and the fix, and exit 2.
- [ ] The workflow behaves as before when `gh` works.
- [ ] `ruff check py` and `pytest` pass.

## A module map for py/README.md

Track: python

### Why

`py/README.md` says how to install and run nest_data but not where anything is. A newcomer looking for the rule behind a validation message has to open files at random. One short table, module by module, would point them straight at the right file.

### Steps

1. Read every module in `py/nest_data`, one docstring at a time.
2. Add a "Where things are" section to `py/README.md`: one row per module, with one sentence on what it does and the command or test that uses it. Include the parity goldens and say which modules they hold to the Node output.
3. Add one paragraph on what to do when a change alters something a contributor sees: both libraries change in the same pull request, and the goldens are regenerated (`py/tests/fixtures/README.md`).

### Done when

- [ ] Every module in `py/nest_data` appears in the table once.
- [ ] A reviewer on the js track can find the rule behind a message from the table alone.
- [ ] The section passes `npm run lint` (formatting and no em dashes).
