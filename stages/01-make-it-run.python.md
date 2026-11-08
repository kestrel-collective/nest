Hello {{name}}. Welcome to Stage {{stage_number}}, {{stage_title}}{{cohort_phrase}}. You are on the python track.

## In one line

Get Nest's Python package running on your own computer, add one line to one file, and take that line through a pull request. About two hours, in pieces, over a few days. You do not need Node for any of it.

## Why this matters

Your first contribution is tiny on purpose. The only new thing here is the loop every contribution follows: branch, commit, push, pull request, review, merge. Once you have done the loop once, every later stage is the same loop with more inside it.

On the python track your code is `py/nest_data`: the package that reads every contributor's files, checks them, and writes the data file the website is built from. The website itself is built for you on every pull request.

## Before you start

- [ ] Accept the collaborator invitation GitHub emailed you. Nothing below works until you do. If you cannot find the email, open {{repo_url}}/invitations.
- [ ] Install Git and Python 3.11 or newer. [docs/DEVELOPMENT.md]({{repo_url}}/blob/main/docs/DEVELOPMENT.md) says how, for each operating system.
- [ ] Skim [docs/CONTRIBUTING.md]({{repo_url}}/blob/main/docs/CONTRIBUTING.md) once. It explains every word used below.

## Steps

1. Get the code and make it run (20 minutes):

   ```bash
   git clone {{repo_url}}.git
   cd nest
   python -m venv .venv
   source .venv/bin/activate        # on Windows: .venv\Scripts\activate
   pip install -e "py[dev]"
   pytest
   nest build-data
   ```

   `pytest` should end with a line saying how many tests passed. `nest build-data` checks every contributor's files and prints `Wrote site/.nest/data.json`: that file is what the website is built from. Write down anything you had to do that these commands did not say, and post it as a comment here. That is a real finding, not a complaint, and it often becomes a documentation fix.

2. Look around before you change anything (10 minutes). Open `README.md`, `docs/DEVELOPMENT.md` and `py/README.md`. Then post three sentences as a comment on this issue: what Nest does, how the code is organised, and where your own directory will live. This is the first check-in. Nobody grades it; it is the habit of orienting before touching.
3. Make a branch: `git switch -c stage-1-{{handle}}`. A branch is a safe place to work; `main` stays untouched.
4. Open `CONTRIBUTORS.md` and add this line at the very end: `- @{{handle}}`.
5. Run `nest validate` and `pytest` again. Both should still pass: you changed one line of documentation, and checking that nothing else moved is part of the loop.
6. Commit: `git commit -am "docs: add {{handle}} to CONTRIBUTORS"`. The message says what the change does, in one line.
7. Push and open the pull request: `git push -u origin stage-1-{{handle}}`, then follow the link git prints. In the description, write `Closes #` followed by this issue's number.
8. Watch the checks on the pull request. One check, the formatting check, runs a tool from the js track; if it is red on your line, read what it printed and fix the line by hand. Red anywhere else: open the failed job, read the first error (not the last), fix it on your branch, commit and push again. Green: a maintainer reviews and merges. If they leave a comment, reply to it, even if only to say you changed it.
9. See the result. Cloudflare builds the whole website from your branch and posts a preview link as a comment on the pull request. Open it: that is the site built from the data file your branch produces, the same way `nest build-data` did on your machine.

A draft pull request titled "Scaffold for @{{handle}}" already exists in your name. It is Stage 2. Leave it alone for now.

## Done when

- [ ] Accept the collaborator invitation GitHub emailed you, then clone the repo.
- [ ] `pytest` passes and `nest build-data` writes the data file on your machine.
- [ ] You opened the Cloudflare preview of your pull request.
- [ ] Your pull request is merged and your handle is in `CONTRIBUTORS.md` on `main`.
- [ ] You can say, in one sentence each, what a branch, a commit and a pull request are.

## If you get stuck

Ask early. Asking never costs you anything here. Comment with the exact command you ran and the exact text it printed, not a summary of it. Being stuck at this stage is normal, and your question helps the next person.

## Words used here

- Clone: your own copy of the project on your computer.
- Virtual environment (`.venv`): a private folder of Python packages for this project, so it does not touch anything else on your computer.
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
    guide: "Accept the collaborator invitation GitHub emailed you, clone the repo, install py with pip, run pytest and nest build-data, and note anything the commands did not say."
  - title: "Look around first"
    guide: "Post three sentences on this issue: what Nest does, how the code is organised, and where your directory will live."
  - title: "Add yourself"
    guide: "On a branch, add your handle to the end of CONTRIBUTORS.md, run nest validate and pytest, and commit."
  - title: "Open the pull request"
    guide: "Push, open a pull request that says Closes and this issue's number, open its Cloudflare preview, and fix any red checks until a maintainer merges it."
acceptance_criteria:
  - "pytest passes on your machine"
  - "Your handle is in CONTRIBUTORS.md on main"
  - "You can say what a branch, a commit and a pull request are"
resources:
  - "{{repo_url}}/blob/main/docs/CONTRIBUTING.md"
  - "{{repo_url}}/blob/main/py/README.md"
```
