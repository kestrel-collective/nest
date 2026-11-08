Hello {{name}}. Welcome to Stage {{stage_number}}, {{stage_title}}{{cohort_phrase}}.

## In one line

Get Nest running on your own computer, add one line to one file, and take that line through a pull request. About two hours, in pieces, over a few days.

## Why this matters

Your first contribution is tiny on purpose. The only new thing here is the loop every contribution follows: branch, commit, push, pull request, review, merge. Once you have done the loop once, every later stage is the same loop with more inside it.

## Before you start

- [ ] Accept the collaborator invitation GitHub emailed you. Nothing below works until you do. If you cannot find the email, open {{repo_url}}/invitations.
- [ ] Install Git and Node 20 or newer. [docs/DEVELOPMENT.md]({{repo_url}}/blob/main/docs/DEVELOPMENT.md) says how, for each operating system.
- [ ] Skim [docs/CONTRIBUTING.md]({{repo_url}}/blob/main/docs/CONTRIBUTING.md) once. It explains every word used below.

## Steps

1. Get the code and make it run (20 minutes):

   ```bash
   git clone {{repo_url}}.git
   cd nest
   npm install
   npm test
   ```

   You should see a line ending in "passed". Write down anything you had to do that these four commands did not say, and post it as a comment here. That is a real finding, not a complaint, and it often becomes a documentation fix.

2. Look around before you change anything (10 minutes). Open `README.md` and `docs/DEVELOPMENT.md`. Then post three sentences as a comment on this issue: what Nest does, how the code is organised, and where your own directory will live. This is the first check-in. Nobody grades it; it is the habit of orienting before touching.
3. Make a branch: `git switch -c stage-1-{{handle}}`. A branch is a safe place to work; `main` stays untouched.
4. Open `CONTRIBUTORS.md` and add this line at the very end: `- @{{handle}}`.
5. Run `npm run lint`. If it complains, run `npm run format` and look at what it changed. That is the formatter, and it will catch you out once; everyone it does.
6. Commit: `git commit -am "docs: add {{handle}} to CONTRIBUTORS"`. The message says what the change does, in one line.
7. Push and open the pull request: `git push -u origin stage-1-{{handle}}`, then follow the link git prints. In the description, write `Closes #` followed by this issue's number.
8. Watch the checks on the pull request. Red: open the failed job, read the first error (not the last), fix it on your branch, commit and push again. Green: a maintainer reviews and merges. If they leave a comment, reply to it, even if only to say you changed it.

A draft pull request titled "Scaffold for @{{handle}}" already exists in your name. It is Stage 2. Leave it alone for now.

## Done when

- [ ] Accept the collaborator invitation GitHub emailed you, then clone the repo.
- [ ] `npm test` passes on your machine.
- [ ] Your pull request is merged and your handle is in `CONTRIBUTORS.md` on `main`.
- [ ] You can say, in one sentence each, what a branch, a commit and a pull request are.

## If you get stuck

Ask early. Asking never costs you anything here. Comment with the exact command you ran and the exact text it printed, not a summary of it. Being stuck at this stage is normal, and your question helps the next person.

## Words used here

- Clone: your own copy of the project on your computer.
- Branch: a named line of work, separate from `main`.
- Commit: a saved step with a one-line message.
- Pull request: asking for your branch to be merged into `main`; where review happens.
- CI: the checks that run on every pull request.

<!-- Machine-readable summary read by the Kestrel platform. Keep it in step with the text above. -->

```kestrel-ticket
competency: technical-communication
level: guided
difficulty: starter
kp: 1
evidence_kind: practice
reserved_for: {{handle}}
stage: 1
steps:
  - title: "Get the code running"
    guide: "Accept the collaborator invitation GitHub emailed you, clone the repo, run npm install and npm test, and note anything the commands did not say."
  - title: "Look around first"
    guide: "Post three sentences on this issue: what Nest does, how the code is organised, and where your directory will live."
  - title: "Add yourself"
    guide: "On a branch, add your handle to the end of CONTRIBUTORS.md, run npm run lint, and commit."
  - title: "Open the pull request"
    guide: "Push, open a pull request that says Closes and this issue's number, and fix any red checks until a maintainer merges it."
acceptance_criteria:
  - "npm test passes on your machine"
  - "Your handle is in CONTRIBUTORS.md on main"
  - "You can say what a branch, a commit and a pull request are"
resources:
  - "{{repo_url}}/blob/main/docs/CONTRIBUTING.md"
  - "{{repo_url}}/blob/main/docs/DEVELOPMENT.md"
```
