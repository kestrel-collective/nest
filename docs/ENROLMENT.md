# Enrolment

How a person gets their directory, their invitation and their stage issues with no maintainer involved.

## What happens

`nest enroll <handle> --name "<Name>" --cohort <id|none> [--track js|python]` performs four idempotent steps and prints one line per step (created, updated, skipped or failed). The track (ADR 0010) is js or python; left out, it is the track the cohort file already records for the person, else js.

- a. Cohort files: the handle is added to `cohorts/<id>/cohort.yml` with its track (a plain `- handle` for js, `- handle: <handle>` with `track: python` for python; enrolling someone again on the other track moves them) and `/contributors/<handle>/ @<handle>` to `.github/CODEOWNERS` in one commit straight to `main` by the bot, `chore(cohort): add @<handle> to <id>`, with no pull request for a maintainer to merge. The edit is made against the newest `main`, so two people enrolled at once both land. Skipped when the cohort is `none`, and when the cohort file does not exist yet (the person is enrolled as an individual joiner and `open-cohort` adds them later).
- b. Scaffold: if `contributors/<handle>/` is not on `main` and no pull request exists from `scaffold/<handle>`, the directory is scaffolded with its planted defect, by the track's own scaffold (`nest scaffold` in `py/` writes a python member's, with `test_profile.py`; the Node CLI writes a js member's, with `profile.test.ts`), and a draft pull request "Scaffold for @<handle>" is opened, assigned to the person, with the body from `.github/PR_TEMPLATE_SCAFFOLD.md`. It is opened by the Nest bot app, so the required checks run on it. An open scaffold pull request from any other account (the workflow token's, from before the app) is closed, and the app opens a new one from the same branch, a draft or ready for review as the old one was. The branch is not pushed to, so whatever the person committed in Stage 2 stays. If a run closed the old one and stopped before opening the new one, the next run opens it. A merged one, or one the app opened and someone closed, is left alone.
- c. Invitation: the handle is invited as a collaborator with push permission, unless already a collaborator or already invited.
- d. Stage issues: stages 1, 2, 3, 4, 6 and 7, each from its track's body where the stage has one (`stages/01-make-it-run.python.md`), labelled `onboarding`, `stage:<n>`, `track:<track>` and `cohort:<id>` when there is one, assigned to the person, in the cohort milestone. An issue that already exists, open or closed, is reused and never opened a second time: the same title, or the same stage number for the same handle under an older title (`Stage 1: … (@handle)`), so renaming a stage in `stages/` opens no new issues.

Every GitHub call is retried three times with exponential backoff, waiting for the rate-limit reset when GitHub names one. The command exits non-zero only when a step still fails after that. `nest open-cohort <id>` runs the same thing for every member of a cohort, each on the track their entry records.

## How Kestrel triggers it

Kestrel sends a `repository_dispatch` event to this repository:

```
POST https://api.github.com/repos/kestrel-collective/nest/dispatches
{ "event_type": "enroll", "client_payload": { "handle": "a-login", "name": "Display Name", "cohort": "2027-01", "track": "python" } }
```

`cohort` is `none` for an individual joiner. `track` is `js` or `python`; Kestrel may leave it out, and existing members then keep their recorded track, everyone else gets js. The token Kestrel uses needs Contents read and write on this repository only. The Enrol workflow (`.github/workflows/enroll.yml`) picks the event up, builds the CLI, installs nest_data (it writes python-track scaffolds) and runs `nest enroll` with `--gh`. A concurrency group per handle means two dispatches for the same person cannot run at the same time.

## Running it by hand

Actions tab, "Enrol", "Run workflow": handle, name, cohort (or `none`) and track (`recorded`, the default, keeps the one the cohort file has). Or locally with the GitHub CLI signed in, and Python with nest_data importable for a python-track member:

```bash
npx nest enroll a-login --name "Display Name" --cohort 2027-01 --track python --dry-run   # prints the plan, no GitHub calls
npx nest enroll a-login --name "Display Name" --cohort 2027-01 --track python --gh        # does it
```

Without `--gh` or `--dry-run` the command prints the pull request bodies and the issue bodies and touches nothing.

## What the learner does themselves

1. Accept the collaborator invitation GitHub emailed them. Nothing else works before this.
2. Stage 1: clone, run the tests (`pytest` on the python track, `npm test` on the js track), add their handle to `CONTRIBUTORS.md`.
3. Stage 2: finish the scaffold pull request that is already open in their name. On `scaffold/<handle>` they fill in `profile.yml` and `page.md` (leaving `handle`, `cohort` and `joined`, which hold the Stage 3 defect), set `visibility.page: public`, push, and mark it ready for review; auto-merge then merges it.

A week after enrolment with no commit from them, the Onboarding workflow leaves one comment, ever, on their Stage 1 issue with those two steps.

Their stage issues are created while the invitation is still pending, and GitHub drops an assignee who has no access yet. Every half hour (or at once on a `repository_dispatch` of type `upkeep`) the Onboarding workflow's `stage-upkeep` job assigns each open, unassigned stage issue to its owner once they are a collaborator.

Enrolment opens the stage issues as the Nest bot app, so their author is `kestrel-nest-bot[bot]`; issues from before the app are by `github-actions[bot]`. Kestrel trusts an onboarding issue opened by a login in its `NEST_BOT_LOGINS` setting and reserves its ticket for the handle in the block straight away, without waiting for the assignment (Kestrel decision D-42); an onboarding issue opened by anyone else still needs that handle as an assignee. So Kestrel's `NEST_BOT_LOGINS` must be `github-actions[bot],kestrel-nest-bot[bot]`: without the app's login there, Kestrel waits for the assignment again on every new stage issue. Never open stage issues with a personal token, for the same reason.

## The invitation token

The workflow's own token is not allowed to read or send repository invitations ("Resource not accessible by integration"). Add a repository secret `NEST_ADMIN_TOKEN`: a fine-grained token from a repository admin, limited to this repository, with **Administration: read and write**. `enroll.yml` uses it for the invitation and nothing else, so issues and pull requests are still opened by the bot. Without it, step c fails with a message that names the secret.

## The Nest bot app

`enroll.yml` writes everything as the Nest bot GitHub App. It mints a token from the repository secrets `NEST_BOT_APP_ID` and `NEST_BOT_PRIVATE_KEY` (docs/REPO-SETTINGS.md sets them up) and uses it to check out and push the scaffold branch, open the scaffold pull request and the stage issues, and commit to `main`. GitHub runs no workflows for a pull request opened with the workflow's own token, so a scaffold pull request from `github-actions[bot]` never ran its required checks and could merge only through an admin bypass. One from the app runs them like any other.

The workflow's first step fails, naming the missing secret, when either is absent. The app needs Contents, Pull requests and Issues: Read and write; without one, the step that needs it fails with a message naming the permissions, and is not retried. The workflow token files only the failure issue.

When the person marks the scaffold pull request ready for review, the auto-merge workflow treats it as their own: a pull request from the app on `scaffold/<handle>` that changes only files belonging in `contributors/<handle>/` gets auto-merge, like the person's own pull requests. Auto-merge is enabled with the workflow token, not the app's: the app is on `main`'s bypass list, and a merge as the app could skip the checks and the approval.

## Re-running safely

Run the workflow or the command again for the same handle. Steps that are done are skipped; only what is missing is performed. A scaffold branch an earlier failed run pushed is replaced, since no pull request uses it yet. Running it again for someone whose open scaffold pull request is from `github-actions[bot]` replaces that pull request with one from the app (step b): that is how to move the ones opened before the app. If a run fails, an issue titled "Enrolment failed for @<handle>" labelled `maintainers` is opened with the job log, and it is closed automatically when a later run for that handle succeeds.

## Withdrawing someone

Use it when a person leaves before finishing, or to start someone again from Stage 1 (a new Kestrel account for the same GitHub login, for example). Re-enrolment alone cannot do that, because it skips every stage issue whose title already exists, open or closed.

`nest withdraw <handle> --gh` (or Actions tab, "Withdraw", with the handle; Kestrel can send a `repository_dispatch` of type `withdraw` with `client_payload: { "handle": "a-login" }`) does, idempotently:

- closes the person's open stage issues as not planned, with one comment saying a new enrolment opens fresh ones;
- renames every stage issue of theirs, open or closed, by appending ` [withdrawn YYYY-MM-DD]`, so the title no longer ends `(@handle)`: enrolment and the Onboarding upkeep no longer see it, and Kestrel withdraws a ticket whose issue is closed as not planned;
- closes an open pull request from `scaffold/<handle>`, or from `bot/enroll-<handle>` left by an enrolment from before membership was committed to `main`;
- cancels a pending invitation, when the `NEST_ADMIN_TOKEN` secret is there (otherwise it says it left the invitation as it is).

It leaves in place, on purpose: collaborator access, the person's `contributors/<handle>/` directory and their `CONTRIBUTORS.md` line. A second run finds nothing to do. Enrol the person again afterwards to open six fresh stage issues.

## The kestrel-ticket block

Every stage issue ends with a fenced `kestrel-ticket` block that Kestrel reads to create a ticket on the person's board. Kestrel validates it strictly (its decision D-38), so the block has exactly these keys: `competency` (a rubric slug: debugging, automated-testing or technical-communication), `level` (guided, supported or independent), `difficulty` (starter, standard or stretch), `kp` (0 to 3), `evidence_kind` (practice, shared_project or proposal), `reserved_for` (the handle, or null for a shared issue), `stage`, `steps` (1 to 8, each with `title` and `guide`), `acceptance_criteria` (1 to 8 sentences) and `resources` (0 to 5 https URLs). The text above the block is for people; the block is for the platform. Keep them in step.

When a template's block changes, nothing needs to be run by hand: every half hour the Onboarding workflow's `stage-upkeep` job puts the current block into every open stage issue created from an older one, and leaves current ones untouched. An issue labelled `track:python` gets the block from its stage's python body where there is one (`01-make-it-run.python.md`); an issue with no track label is a js issue. Each track's body for a stage carries its own block, so the two may differ in their steps and resources, never in their keys. The same job checks the shared pool. Every open issue labelled `good-shared-issue` must also carry `stage:5` and a track label, `track:js` or `track:python`, and each track needs at least three open ones. The job names every problem, with the command that fixes it, and the run fails until it is fixed. `scripts/open-backlog.mjs` and the two shared-issue forms (one per track) apply all three labels together; the script creates any of them the repository lacks first, from `.github/labels.json`, and checks the labels on the issue GitHub reports back. Kestrel can also start that job at once with a `repository_dispatch` of type `upkeep`:

```
POST https://api.github.com/repos/kestrel-collective/nest/dispatches
{ "event_type": "upkeep" }
```

## Limits worth knowing

- Step a and the Cohort workflow commit straight to `main`, with a token from the Nest bot GitHub App (`NEST_BOT_APP_ID`, `NEST_BOT_PRIVATE_KEY`) that `main`'s ruleset lets through; docs/REPO-SETTINGS.md sets it up. Without the app they use the workflow token, which a rule requiring pull requests refuses (and which cannot be put on a bypass list); they then fail with a message naming the fix instead of falling back to a pull request.
- Individual joiners (`cohort: none`) have no cohort file to change and no milestone; their profile has no `cohort` field until they join one.
