# Contributing to Nest

This guide is for someone who has never opened a pull request. If you have, skim the headings and go to [Your directory](#your-directory). The short version of everything below: ask early, record what you actually saw, and say what you think before you look.

## How we work here

These five habits are the whole curriculum. Every stage practises them.

- Orient before you touch. Spend ten minutes finding out what a project does and how it is organised before changing a line.
- Reproduce before you fix. A fix you cannot trigger is not a fix.
- Say it before you look. Write down what you think is wrong and how you will check, then check. A written guess finds causes faster than reading code at random, and it is what makes your explanation possible later.
- Prove it with a test. A test that fails before the fix and passes after is the evidence.
- Write for someone who was not there. The pull request description is part of the work.

And one norm: asking never costs you anything. A question on your stage issue is answered within a working day, with a question or a hint, never with the answer to the part that is yours. Reasoning is what we look for. A merged pull request is not proof on its own, and a pull request that got a real review and did not merge is not a failure.

## Choose your track

Nest has two tracks. They teach the same habits on the same ladder of seven stages; what differs is the language you work in and the tools you run.

- **The python track** works in `py/nest_data`, the Python package that reads every contributor's files, checks them, and writes the data the website is built from. You need Python 3.11 or newer, and you never need Node: the website is built for you on every pull request.
- **The js track** works in the website itself (Astro and TypeScript) and the Node tools around it. You need Node 20 or newer.

Choose the language you want to get better at, not the one you think is easier. If you know neither, the python track has less to install. Your track is chosen when you enrol (Kestrel asks), and it is recorded in your cohort's file, `cohorts/<id>/cohort.yml`: a plain `- your-handle` is the js track, and `- handle: your-handle` with `track: python` under it is the python track. To switch, ask on any of your stage issues before you start Stage 1; a maintainer re-enrols you on the other track.

What the track changes:

- Stages 1, 3, 4 and 5 read differently on each track: the commands, the test you write, and where your shared-code issue lives. [Stages 1, 3, 4 and 5 on each track](#stages-1-3-4-and-5-on-each-track) below walks through each.
- Stages 2, 6 and 7 are the same on both: your page, a review of someone else's work, and a proposal. Their issues name your track's commands.
- Your directory has one test file: `test_profile.py` on the python track, `profile.test.ts` on the js track.
- Your stage issues carry a `track:python` or `track:js` label, and so do the shared issues you can claim in Stage 5.

## What you need

On both tracks:

- A GitHub account. Your login, in lower case, is your handle here.
- Git. On Windows install Git for Windows; on macOS run `xcode-select --install`; on Linux use your package manager.
- A terminal and any text editor.

Then one of:

- The python track: Python 3.11 or newer. Check with `python --version` (`python3 --version` on macOS and Linux).
- The js track: Node 20 or newer. Check with `node --version`.

## Words you will see

- Repository: the project, with its whole history. Often shortened to repo.
- Clone: your own copy of the repository on your computer.
- Branch: a named line of work. You make changes on a branch, never on `main`.
- Commit: a saved step on your branch, with a one-line message saying what it does.
- Push: sending your commits from your computer to GitHub.
- Pull request (PR): asking for your branch to be merged into `main`. This is where review happens.
- CI: the checks that run on every pull request. Green means they passed.
- Merge: your change becomes part of `main`. Nothing is live until it merges.
- Check-in: a short comment on your stage issue at a set point, saying what you saw or what you think. Never graded.
- Track: python or js, the language you work in here. See [Choose your track](#choose-your-track).
- Virtual environment: on the python track, a private folder of Python packages for this project (`.venv`), so nothing else on your computer is touched.

## 1. Get the code

If you are a cohort member you have write access and can push branches directly. Otherwise fork the repository first (the Fork button on GitHub) and clone your fork instead.

On the python track:

```bash
git clone https://github.com/kestrel-collective/nest.git
cd nest
python -m venv .venv
source .venv/bin/activate        # on Windows: .venv\Scripts\activate
pip install -e "py[dev]"
pytest
nest build-data
```

`pytest` ends with a line saying how many tests passed. `nest build-data` checks every contributor's files and writes `site/.nest/data.json`, the file the website is built from. Run `source .venv/bin/activate` again in every new terminal; your prompt shows `(.venv)` when it is active.

On the js track:

```bash
git clone https://github.com/kestrel-collective/nest.git
cd nest
npm install
npm test
```

You should see a line ending in "passed". `npm install` also builds the js track's `nest` command.

On either track: if the tests do not pass, that is worth a comment on your stage issue before you change anything.

## 2. Make a branch

```bash
git switch main
git pull
git switch -c stage-1-your-handle
```

Name the branch after what you are doing. One branch per pull request.

## 3. Make your change

For Stage 1 the change is one line: add `- @your-handle` to the end of `CONTRIBUTORS.md`. Later stages change files in your own directory under `contributors/your-handle/`.

Rules that apply to every change:

- Edit only your own directory, plus `CONTRIBUTORS.md` in Stage 1. Stage 5 is the first time you touch shared code, through an issue labelled `good-shared-issue` and your track's label.
- No em dashes anywhere. Use a comma, a full stop or a colon.
- Never invent people or evidence. Your page lists what you did.

## 4. Check it before you push

On the python track:

```bash
nest validate      # checks every profile.yml, page.md and cohort.yml
pytest             # runs every test, including test_profile.py in your directory
nest build-data    # writes the data the site is built from, so you see what the site sees
ruff check py      # in Stage 5, when you change py/nest_data: the Python style check
```

On the js track:

```bash
npm run validate   # checks every profile.yml, page.md and cohort.yml
npm test           # runs every test, including the ones in your directory
npm run format     # fixes formatting
npm run lint       # confirms formatting and that no em dash slipped in
```

Validation tells you the file, the line, the field and what to change, in that order, and both tracks' commands say exactly the same thing. Fix only what it names and run it again. CI runs these commands for both tracks, so if yours pass here they pass there.

Two things that catch everyone once. On the js track every command starts with `npm run`, except `npm install` and `npm test`; `npm build` on its own prints "Unknown command". On the python track, a "command not found: nest" means your virtual environment is not active in this terminal.

To see your page before you push: on the js track run `npm run dev` and open http://localhost:4321/p/your-handle/ (once the page is public; private pages are not built), and press Ctrl+C to stop it. On the python track open the preview link Cloudflare posts on your pull request; `nest page-status your-handle --local` tells you before you push whether the site would build your page.

## 5. Commit

```bash
git add CONTRIBUTORS.md
git commit -m "docs: add your-handle to CONTRIBUTORS"
```

The message is one line, present tense, starting with a type: `feat:`, `fix:`, `docs:`, `test:` or `chore:`. Say what the change does, not what you did. Many small commits are better than one big one.

## 6. Push and open the pull request

```bash
git push -u origin stage-1-your-handle
```

Git prints a link. Open it, or go to the repository on GitHub and press "Compare and pull request". The template asks for four things: what changed, why, how you checked it, and what it does not cover. Fill each with something specific to this change. Write `Closes #123` with your stage issue's number, then press "Create pull request".

A draft pull request is fine if you want early feedback. Mark it ready when you are.

## 7. What happens next

1. CI runs both tracks' checks: validation, the tests, the build and the formatting check. If something is red, open the failed job, read the first error, fix it on your branch, commit and push again. The pull request updates itself. A red formatting check on a python-track pull request is the one check from the js track's tools; read the line it names and fix it by hand.
2. A preview of the site is built from your branch, so you can see your page before it is live. Cloudflare posts the link as a comment on the pull request.
3. Someone reviews. Comments are about the change, not about you. Reply to each one, make the change or say why not, and push again. Keeping a decision and explaining why is as good an answer as changing it.
4. Merge. Changes that touch only your own directory merge automatically once CI is green. Anything else is merged by a maintainer after review.
5. The site redeploys from `main` after every merge. A public page is live about two minutes later; see [Stage 2: when your page appears](#stage-2-when-your-page-appears).

## Stages 1, 3, 4 and 5 on each track

Your stage issue has the full steps for your track. This is the short version of each, side by side, so you can see what the other track does too.

### Stage 1: make it run

- **Python track.** Install with pip into a virtual environment, run `pytest` and `nest build-data` (section 1 above). Add your line to `CONTRIBUTORS.md`, run `nest validate` and `pytest` again, and open the pull request. Then open the Cloudflare preview link on it: that is the whole website, built from the data your branch produces. No Node at any point.
- **js track.** `npm install` and `npm test`, add your line, run `npm run lint`, and open the pull request. `npm run dev` shows the site on your own machine.

### Stage 3: fix your defect

Both tracks: one defect is planted in your own `profile.yml` or `page.md`, it passes every check, and it shows on your live page. You predict, reproduce, guess and check, then fix it with the smallest change.

- **Python track.** Run `nest build-data` and find your entry in `site/.nest/data.json`: it is exactly what the website renders, so the wrong thing on your page is in there too. Check your fix with `nest validate`, `pytest` and `nest build-data`, then on the pull request's preview.
- **js track.** Read your live page and compare it with your files. Check your fix with `npm run validate` and `npm test`, and with `npm run dev`.

### Stage 4: write the test

Both tracks: the test you write fails while the Stage 3 defect is there and passes once it is gone, and your pull request shows both outputs.

- **Python track.** Your test goes in `contributors/your-handle/test_profile.py`, after the one already there, which loads your directory with `validate_contributor(ROOT, HANDLE)` from `nest_data`. Your data is in `contributor["profile"]` and `contributor["page"]["sections"]`, exactly as in `site/.nest/data.json`. Run it with `pytest contributors/your-handle`.
- **js track.** Your test goes in `contributors/your-handle/profile.test.ts`, after the one already there, which uses `validateContributor(root, handle)` from `@nest/schema`. Run it with `npx vitest run contributors/your-handle`.

### Stage 5: ship to shared code

Both tracks: you claim an issue labelled `good-shared-issue` and your track's label, reproduce the gap before you change anything, change it with a test, and answer a real review.

- **Python track.** Your pool is [good-shared-issue and track:python](https://github.com/kestrel-collective/nest/issues?q=is%3Aopen+label%3Agood-shared-issue+label%3Atrack%3Apython+no%3Aassignee). The code is `py/nest_data`; tests go in `py/tests`. Before you push, run `ruff check py`, `ruff format --check py`, `nest validate`, `pytest` and `nest build-data`. One thing particular to this code: it must produce exactly what the js track's library produces, and `py/tests/golden` records that. If your change alters something a contributor sees, the issue says so and the change includes both libraries; otherwise the parity tests tell you the moment something moved.
- **js track.** Your pool is [good-shared-issue and track:js](https://github.com/kestrel-collective/nest/issues?q=is%3Aopen+label%3Agood-shared-issue+label%3Atrack%3Ajs+no%3Aassignee). The code is the site and `packages/`. Before you push, run `npm run validate`, `npm test`, `npm run lint` and `npm run build`.

## Your directory

`contributors/your-handle/` is created for you when you are enrolled. It holds:

- `profile.yml`: `handle`, `cohort` and `joined` are set for you and stay as they are. Fill in `name`, `intro` (one or two sentences about where you are now), `skills_developing` (up to eight), and `next` if you like. Set `visibility.page` to `public` when you want your page live; set it back to `private` any time. List work accepted by other projects under `projects`, newest first, with the merged pull request's address. Never list work that is not yours or not merged.
- `page.md`: four sections under fixed headings: Where I started, What I learned, What I built, What I am working on next. Plain text, a few sentences each. Links to `https://` addresses, bold, italics and inline code work; nothing else does.
- `test_profile.py` on the python track, or `profile.test.ts` on the js track: the tests that guard your page. The first one checks that your directory validates. Stage 4 adds the one that would have caught your Stage 3 defect.
- `.practice.json`: counts written by a workflow after your pull requests merge. Do not edit it.

Your scaffold has one defect planted on purpose. Finding it is Stage 3. Do not go looking for it before then; it is more useful as a surprise.

## Stage 2: when your page appears

Cloudflare Pages rebuilds the site from `main` on every merge, not only on releases. The "Nest release" number on the site is the version of the code, and content changes do not wait for it. The build takes under a minute, so your page is live at `https://nest.kestrelcollective.org/p/your-handle/` about two minutes after your Stage 2 pull request, "Scaffold for @your-handle", merges. The site's pages are not cached, so a normal reload shows it. The Kestrel Collective site picks your page up a few minutes after that.

It appears when all three of these are true on `main`:

1. `contributors/your-handle/` is there. The pull request "Scaffold for @your-handle" has to be merged first, and it must not be reverted.
2. `visibility.page` in `profile.yml` is `public`. The scaffold sets it to `private`, so merging the scaffold alone never shows a page.
3. Everything validates. One invalid file anywhere stops the whole build, and the build log names the file, the line and the field. CI runs the same check on every pull request, so a broken file cannot normally reach `main`.

If your page is not there ten minutes after the merge, run this from your clone, on the python track or anywhere with `nest_data` installed. It reads `main` on GitHub, says yes or no for the page, the feed, the cohort page and the home page, and names what is in the way:

```bash
nest page-status your-handle
```

Add `--local` to check your own working copy before you push. On the js track without Python, `npm run validate` names any problem in the files, and a maintainer can run `nest page-status` for you. Paste its output on your stage issue if the answer is not clear.

## Getting help

- Stuck on git or the terminal: say so on your stage issue, with the exact command and the exact output. That is what the issue is for, and the question helps the next person.
- Found a bug in Nest itself: open an issue with what you did, what you expected and what happened. That is real open-source work, and if you fix it, it counts as shared code.
- Something uncomfortable happened: see [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).

## How you got here

Your directory, your collaborator invitation and your stage issues were created by [enrolment](ENROLMENT.md), on your track, either when Kestrel enrolled you or when a maintainer ran it for you. If any of them is missing, say so on any of your issues; the command is safe to run again.
