# Repository settings

Everything that cannot be a file in the repository. Follow it top to bottom in the GitHub UI; it takes under ten minutes. Tick each box as you go.

## Organisation (once)

- [ ] Create the `kestrel-collective` organisation if it does not exist.
- [ ] Teams: create `maintainers` (closed) and add every maintainer. CODEOWNERS refers to it.

## Repository: General

- [ ] Features: Issues on. Wiki off. Projects off. Discussions off for now.
- [ ] Pull requests: allow squash merging only. Default commit message: pull request title. Untick merge commits and rebase merging.
- [ ] Tick "Allow auto-merge". The own-directory workflow depends on it.
- [ ] Tick "Automatically delete head branches".

## Repository: Rules, branch `main`

What the rules have to do: a pull request that changes only its author's own contributor directory merges on its own once CI passes, and so does the scaffold pull request, which the Nest bot app opens and the member finishes in Stage 2. Any other pull request, one that touches a shared file such as `CONTRIBUTORS.md` in Stage 1, also needs a maintainer's approval. A ruleset's required approvals cannot tell the two kinds apart, so the ruleset requires no approvals and requires the check `maintainer-gate` instead. The Maintainer gate workflow posts that check, as the app, on every pull request's head commit (`packages/cli/src/gate.ts`):

- success at once when every changed file belongs in the author's directory (for the app's scaffold pull request, the directory its `scaffold/<handle>` branch names);
- otherwise success only when a maintainer (admin or maintain permission, not the author) has approved the head commit and no maintainer has changes requested. A new push needs a new approval.

It runs again on every push (`pull_request_target`) and after every review (the Review recorded workflow, then `workflow_run`), both from `main`'s code. The ruleset requires it **from the app**, so a workflow someone adds on a branch cannot post a passing `maintainer-gate` of its own, and the app's key sits in an environment that only `main` can use (below), so no branch workflow can post as the app either.

Before turning the ruleset on: the app needs **Checks: Read and write** (next section), the `nest-bot` environment holds its secrets (below), and the Maintainer gate workflow is on `main` and has run once on an open pull request, so its check name can be picked.

Repository **Settings**, **Rules**, **Rulesets**, **New ruleset**, **New branch ruleset**:

- [ ] **Ruleset name**: `main`. **Enforcement status**: **Active**.
- [ ] **Bypass list**: **Add bypass**, **Apps**, `kestrel-nest-bot`, **Always allow**. Nothing else: not "Repository admin", not a team. The workflows' own token (`github-actions[bot]`) cannot be put on a bypass list, so without the app the practice counts, a new cohort's file (Cohort) and adding each member to their cohort (Enrol step a) fail once this is on.
- [ ] **Target branches**: **Add target**, **Include default branch** (`main`).
- [ ] **Restrict deletions**: on.
- [ ] **Block force pushes**: on.
- [ ] **Require linear history**: on (squash merging only, as above).
- [ ] **Require a pull request before merging**: on, with
  - **Required approvals**: `0`. The maintainer gate does this job.
  - **Dismiss stale pull request approvals when new commits are pushed**: on. The gate only counts an approval of the head commit anyway.
  - **Require review from Code Owners**: off. A member is the code owner of their own directory and cannot approve their own pull request, so this would hold every own-directory pull request.
  - **Require approval of the most recent reviewable push**: off.
  - **Require conversation resolution before merging**: off.
  - **Allowed merge methods**: **Squash**.
- [ ] **Require status checks to pass**: on, with
  - `checks`, source **GitHub Actions**: the CI workflow's gate job, which passes only when its `python`, `js` and `site` jobs all pass (ADR 0010). Require `checks` only, not the jobs behind it, so the Python versions in the matrix can change without touching this rule.
  - `maintainer-gate`, source **kestrel-nest-bot**: pick the app in the source menu next to the check, not "any source".
  - **Require branches to be up to date before merging**: off. Auto-merge does not update a branch, so with it on every open own-directory pull request would wait for someone to press "Update branch" each time `main` moves; the `checks` job builds the merge commit anyway.
- [ ] Everything else (signed commits, deployments, code scanning, merge queue): off.
- [ ] Remove any older classic branch protection on `main`, so the two do not stack.

Check it: a pull request that changes only `contributors/<handle>/` shows `maintainer-gate` green with "Own directory of @handle" and merges once `checks` passes; one that changes `CONTRIBUTORS.md` shows "Needs a maintainer's approval" until a maintainer approves, then turns green on its own.

## The Nest bot GitHub App (commits to `main`, scaffold pull requests, stage issues)

The practice-counts, Cohort and Enrol workflows commit straight to `main`. They do it with a short-lived token from a GitHub App that the ruleset lets through. The Enrol workflow also opens the scaffold pull request and the stage issues with it: GitHub runs no workflows, so no required checks, for a pull request opened with the workflow's own token. Set it up before turning on the rule above.

- [ ] Organisation **Settings**, **Developer settings**, **GitHub Apps**, **New GitHub App**. Name `kestrel-nest-bot` (any free name). Homepage `https://nest.kestrelcollective.org`. **Webhook**: untick **Active**.
- [ ] **Permissions**, **Repository permissions**: **Contents**, **Issues**, **Pull requests** and **Checks**, each **Read and write**. Nothing else (Metadata read-only is added by itself). Checks is for the `maintainer-gate` check (above). An app created earlier with Contents only: add the others on the app's page, then accept them on the installation (organisation **Settings**, **GitHub Apps**, `kestrel-nest-bot`, review the permission request). Until then enrolment fails with a message naming the permissions, and the Maintainer gate workflow cannot post its check.
- [ ] **Where can this GitHub App be installed?**: **Only on this account**. **Create GitHub App**.
- [ ] On the app's page note the **App ID**. Scroll to **Private keys**, **Generate a private key**: a `.pem` file downloads. Keep it in the password manager.
- [ ] **Install App** (left menu), the organisation, **Only select repositories**: `nest`. **Install**.
- [ ] Put `NEST_BOT_APP_ID` = the App ID, and `NEST_BOT_PRIVATE_KEY` = the whole contents of the `.pem` file, from `-----BEGIN` to `-----END`, as secrets of the `nest-bot` environment (next section), not as repository secrets. On this repository's **Settings**, **Secrets and variables**, **Actions**, **Variables** tab add `NEST_BOT_APP_ID` = the App ID as well (the table below says which workflow reads which). Never put the private key on the Variables tab: variables are stored and shown in plain text to anyone who can open the repository's Actions settings.
- [ ] Now add the app to the ruleset's bypass list (above): **Add bypass**, **Apps**, `kestrel-nest-bot`, mode **Always allow**.
- [ ] Check: run **Practice counts** from the Actions tab; its "A token for commits to main" step is green, not skipped.

| Name                   | Where                                                    | Read by                                                                                                                                                | What it is                                                                                                                                             |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEST_BOT_APP_ID`      | `nest-bot` environment secret, and a repository variable | Enrol, Rewrite stage issues and Maintainer gate read the secret (the variable when the secret is absent); practice counts and Cohort read the variable | The App ID, a number. Not sensitive.                                                                                                                   |
| `NEST_BOT_PRIVATE_KEY` | `nest-bot` environment secret only                       | Enrol, Rewrite stage issues, Maintainer gate, practice counts, Cohort                                                                                  | The app's private key, the whole `.pem`. If it is ever exposed, generate a new one on the app's page, update the secret, and delete the old key there. |

Without `NEST_BOT_APP_ID` the practice-counts and Cohort workflows use their own token, which works only while `main` has no rule requiring pull requests (a fork for development, for example). Enrol, Rewrite stage issues and Maintainer gate do not fall back: their first step fails, naming the missing secret.

## The `nest-bot` environment (where the secrets live)

Every member is a collaborator with push access, and a workflow on any branch they push can read the repository's secrets. Kept as repository secrets, the app's private key (which bypasses `main`'s rules) and `NEST_ADMIN_TOKEN` (a repository admin's token) would be readable by every member, and the `maintainer-gate` check could be faked. An environment's secrets reach only the jobs it allows, and this one allows `main` only. Every workflow job that reads one of these secrets names `environment: nest-bot`; they all run from `main` (dispatches, the schedule, pushes to `main`, `pull_request_target` and `workflow_run`), and a test keeps it that way.

- [ ] **Settings**, **Environments**, **New environment**: `nest-bot`.
- [ ] **Deployment branches and tags**: **Selected branches and tags**, add the rule `main`. Nothing else.
- [ ] **Required reviewers** and **Wait timer**: none (the jobs run unattended).
- [ ] **Environment secrets**: add `NEST_BOT_APP_ID`, `NEST_BOT_PRIVATE_KEY`, `NEST_ADMIN_TOKEN` and `LANDING_DEPLOY_HOOK`, with the same values as before.
- [ ] Then delete those four from the repository's **Secrets** tab, so only the environment has them.
- [ ] Check: run **Practice counts** from the Actions tab on `main`; it is green and the run shows the `nest-bot` environment. GitHub lists each run as a deployment to `nest-bot` on the repository's page; that is expected.

## Repository: Actions

- [ ] Actions permissions: allow all actions and reusable workflows (the workflows use `actions/*` only).
- [ ] Workflow permissions: "Read repository contents and packages permissions". Each workflow raises its own permissions in its file.
- [ ] Leave "Allow GitHub Actions to create and approve pull requests" unticked. No workflow opens a pull request with its own token: enrolment opens the scaffold pull request as the Nest bot app.

## Repository: Code security

- [ ] Enable private vulnerability reporting (SECURITY.md points people there).
- [ ] Dependabot alerts on. Dependabot version updates come from `.github/dependabot.yml`.

## Labels

- [ ] Run the "Sync labels" workflow once from the Actions tab (workflow_dispatch). It creates onboarding, good-shared-issue, proposal, bug, stage:1 to stage:7, track:js and track:python. Cohort labels are created by `nest open-cohort`. A label that fails does not stop the others: the run lists every failure at the end and is marked failed, so read its last lines.

## Cloudflare Pages (the site)

- [ ] Workers and Pages: create a Pages project connected to this repository, production branch `main`.
- [ ] Build command: `npm ci && npm run build`. Build output directory: `site/dist`. Root directory: `/` (the repository root, not `site/`). `npm run build` runs the Python data step first (`nest build-data`, ADR 0010), so the build needs Python as well as Node.
- [ ] Environment variable `NODE_VERSION` = `20`.
- [ ] Environment variable `PYTHON_VERSION` = `3.12`. The data step needs 3.11 or newer and fails the build, saying so, without it. The build image has Python already; this pins the version so an image update cannot change it.
- [ ] Preview deployments: all branches (pull requests get a preview link).
- [ ] Custom domain: `nest.kestrelcollective.org`.

## DNS

- [ ] At the DNS provider for `kestrelcollective.org`: CNAME `nest` to the Pages project hostname (`<project>.pages.dev`), proxied if the zone is on Cloudflare.
- [ ] Wait for `curl -f https://nest.kestrelcollective.org/api/pages.json` to answer.
- [ ] Only then set `NEXT_PUBLIC_NEST_URL` in the landing site and redeploy it.

## Secrets

The workflows use the built-in `GITHUB_TOKEN`, plus `NEST_ADMIN_TOKEN` for invitations (docs/ENROLMENT.md), `LANDING_DEPLOY_HOOK` for the landing site, and the Nest bot app's `NEST_BOT_APP_ID` and `NEST_BOT_PRIVATE_KEY` (above, with a table of where each is read). All four are secrets of the `nest-bot` environment, never repository secrets (above). Cloudflare Pages deploys through its git integration and needs no secret.

## Enrolment

- [ ] Give Kestrel a fine-grained token with repository access to `nest` only and Contents read and write, stored on the Kestrel side as `NEST_DISPATCH_TOKEN` with `NEST_REPO=kestrel-collective/nest`.
- [ ] Run the Enrol workflow once by hand with a test handle you control. Check that the scaffold pull request and the six issues are from `kestrel-nest-bot[bot]` and that CI ran on the pull request, and check the invitation; then delete them.
