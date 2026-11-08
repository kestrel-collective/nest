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

- [ ] Add a ruleset (or classic protection) for `main`: require a pull request before merging, 1 approval, dismiss stale approvals.
- [ ] Require status checks to pass: `checks` (the CI workflow's gate job, which passes only when its `python`, `js` and `site` jobs all pass; ADR 0010). Require `checks` only, not the jobs behind it, so the Python versions in the matrix can change without touching this rule. Require branches to be up to date.
- [ ] Require review from code owners.
- [ ] Block force pushes and deletions.
- [ ] Bypass list: add the **Nest bot** GitHub App (next section). Nothing else bypasses. The workflows' own token (`github-actions[bot]`) cannot be put on a bypass list, and "Repository admin" does not cover it, so without the app three things fail once this rule is on: the practice counts, a new cohort's file (the Cohort workflow) and adding each new member to their cohort (Enrol step a).

## The Nest bot GitHub App (commits to `main`)

The practice-counts, Cohort and Enrol workflows commit straight to `main`. They do it with a short-lived token from a GitHub App that the ruleset lets through. Set it up before turning on the rule above.

- [ ] Organisation **Settings**, **Developer settings**, **GitHub Apps**, **New GitHub App**. Name `kestrel-nest-bot` (any free name). Homepage `https://nest.kestrelcollective.org`. **Webhook**: untick **Active**.
- [ ] **Permissions**, **Repository permissions**: **Contents: Read and write**. Nothing else (Metadata read-only is added by itself).
- [ ] **Where can this GitHub App be installed?**: **Only on this account**. **Create GitHub App**.
- [ ] On the app's page note the **App ID**. Scroll to **Private keys**, **Generate a private key**: a `.pem` file downloads. Keep it in the password manager.
- [ ] **Install App** (left menu), the organisation, **Only select repositories**: `nest`. **Install**.
- [ ] This repository, **Settings**, **Secrets and variables**, **Actions**: on the **Variables** tab add `NEST_BOT_APP_ID` = the App ID; on the **Secrets** tab add `NEST_BOT_PRIVATE_KEY` = the whole contents of the `.pem` file, from `-----BEGIN` to `-----END`.
- [ ] Now add the app to the ruleset's bypass list (above): **Add bypass**, **Apps**, `kestrel-nest-bot`, mode **Always allow**.
- [ ] Check: run **Practice counts** from the Actions tab; its "A token for commits to main" step is green, not skipped.

Without `NEST_BOT_APP_ID` the workflows use their own token, which works only while `main` has no rule requiring pull requests (a fork for development, for example).

## Repository: Actions

- [ ] Actions permissions: allow all actions and reusable workflows (the workflows use `actions/*` only).
- [ ] Workflow permissions: "Read repository contents and packages permissions". Each workflow raises its own permissions in its file.
- [ ] Tick "Allow GitHub Actions to create and approve pull requests".

## Repository: Code security

- [ ] Enable private vulnerability reporting (SECURITY.md points people there).
- [ ] Dependabot alerts on. Dependabot version updates come from `.github/dependabot.yml`.

## Labels

- [ ] Run the "Sync labels" workflow once from the Actions tab (workflow_dispatch). It creates onboarding, good-shared-issue, proposal, bug, stage:1 to stage:7, track:js and track:python. Cohort labels are created by `nest open-cohort`.

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

The workflows use the built-in `GITHUB_TOKEN`, plus `NEST_ADMIN_TOKEN` for invitations (docs/ENROLMENT.md) and the Nest bot app's `NEST_BOT_APP_ID` and `NEST_BOT_PRIVATE_KEY` (above). Cloudflare Pages deploys through its git integration and needs no secret.

## Enrolment

- [ ] Settings, Actions, General, "Workflow permissions": tick "Allow GitHub Actions to create and approve pull requests". Without it the Enrol workflow cannot open the scaffold and cohort pull requests.
- [ ] Give Kestrel a fine-grained token with repository access to `nest` only and Contents read and write, stored on the Kestrel side as `NEST_DISPATCH_TOKEN` with `NEST_REPO=kestrel-collective/nest`.
- [ ] Optional: a second fine-grained token with Contents, Pull requests and Issues read and write as the repository secret `NEST_BOT_TOKEN`, so bot pull requests get CI and auto-merge (see docs/ENROLMENT.md).
- [ ] Run the Enrol workflow once by hand with a test handle you control, check the scaffold pull request, the invitation and the six issues, then delete them.
