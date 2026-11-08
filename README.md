# Nest

Nest is Kestrel Collective's open-source onboarding project. It is a real, maintained codebase whose purpose is to be the first open-source project a new contributor works in. Every contributor gets a page here that they build themselves, pull request by pull request, and that keeps growing with every verified contribution they make anywhere.

The site is published at https://nest.kestrelcollective.org.

## Two tracks

Nest has a python track and a js track (ADR 0010). The python track works in `py/nest_data`, the Python package that checks every contributor's files and writes the data the site is built from, and needs no Node. The js track works in the Astro site and the Node tools. [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md#choose-your-track) helps you choose.

## Quick start

On the python track you need Git and Python 3.11 or newer (`python --version` to check). Then:

```bash
git clone https://github.com/kestrel-collective/nest.git
cd nest
python -m venv .venv
source .venv/bin/activate        # on Windows: .venv\Scripts\activate
pip install -e "py[dev]"
pytest
nest build-data
```

On the js track you need Git and Node 20 or newer (`node --version` to check). Then:

```bash
git clone https://github.com/kestrel-collective/nest.git
cd nest
npm install
npm test
```

`npm install` fetches everything and builds the js track's `nest` command. Either track's tests should end with a line saying they passed. If they do not, say so on your stage issue before changing anything.

## See the site in your browser

On the python track, open the preview link Cloudflare posts on every pull request: it is the whole site, built from your branch. The rest of this section is the js track's, on your own machine.

```bash
npm run dev
```

Then open http://localhost:4321/ in your browser. The page updates on its own every time you save a file. Your own page is at http://localhost:4321/p/your-handle/ once `visibility.page` in your `profile.yml` says `public`; private pages are not built, so they show the "no page here" screen until then. Press Ctrl+C in the terminal to stop.

If port 4321 is already in use, run it on another one: `npx astro dev --root site --port 4322`, then open http://localhost:4322/.

To see exactly what production will serve, build and preview it: `npm run build`, then `npm run preview`, then open http://localhost:4321/.

## Everyday commands

On the python track, with the virtual environment active:

| Command                  | What it does                                                                         | What you should see                        |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| `nest validate`          | Checks every contributor and cohort file. CI runs the same thing.                    | "no problems", or file:line and what to do |
| `pytest`                 | Runs nest_data's tests and every `test_*.py` in contributor directories.             | "passed"                                   |
| `nest build-data`        | Writes `site/.nest/data.json`, the data the site is built from.                      | "Wrote site/.nest/data.json"               |
| `nest page-status <you>` | Whether the site would build your page, and what is in the way.                      | yes or no for each place, and why          |
| `ruff check py`          | The Python style check, for changes to `py/nest_data`.                               | "All checks passed!"                       |
| `nest --help`            | The python track's `nest`: validate, build-data, page-status, feed, the defect bank. | A list of commands                         |

On the js track, every command here starts with `npm run`, except `npm install` and `npm test`. Typing `npm build` prints "Unknown command"; it is `npm run build`.

| Command            | What it does                                                                                           | What you should see                         |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `npm run dev`      | Runs the site locally with live reload.                                                                | A local address to open; Ctrl+C stops it.   |
| `npm run validate` | Checks every contributor and cohort file. CI runs the same thing.                                      | "no problems", or file:line and what to do  |
| `npm test`         | Runs every test, including the ones in contributor directories.                                        | "passed"                                    |
| `npm run lint`     | Checks formatting and that no em dash slipped in.                                                      | "All matched files use Prettier code style" |
| `npm run format`   | Fixes formatting for you.                                                                              | The files it changed, if any                |
| `npm run build`    | Runs the data step (Python, when it is there), then builds the packages and the site into `site/dist`. | "3 page(s) built" or more                   |
| `npm run preview`  | Serves the built site, the way production will.                                                        | A local address to open                     |
| `npx nest help`    | The js track's `nest`: validate, scaffold, new-task, enroll, open-cohort.                              | A list of commands                          |

## The ladder

Seven stages. An invitation, not a gate. Experienced already? Skip to Stage 5 or straight to the Kestrel board.

| Stage | Name                | What you do                                                   |
| ----- | ------------------- | ------------------------------------------------------------- |
| 1     | Make it run         | Clone, install, run the tests, open your first pull request.  |
| 2     | Your page exists    | Fill in your profile. Your page goes live from a preview.     |
| 3     | Fix your defect     | Your scaffold ships with a defect. Reproduce it, then fix it. |
| 4     | Write the test      | A test that fails before your fix and passes after it.        |
| 5     | Ship to shared code | Claim a real issue in Nest's shared code. Real review.        |
| 6     | Review a peer       | Review another contributor's pull request.                    |
| 7     | Propose something   | Write a short proposal. Then: any repo you like.              |

Each stage arrives as an issue assigned to you, with the steps written out. Start with [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md); it is written for someone who has never opened a pull request.

## When something goes wrong

- `Unknown command: "build"`: you typed `npm build`. Use `npm run build`. The same goes for dev, lint, format, validate and preview.
- `Node.js v18... is not supported` or similar: install Node 20 or newer, then run `npm install` again.
- `nest: command not found` on the python track: the virtual environment is not active in this terminal. Run `source .venv/bin/activate` (on Windows `.venv\Scripts\activate`) and try again.
- `nest: command not found` or `Cannot find module` on the js track: run `npm install` again; it builds the command.
- `Port 4321 is in use`: something else is using it. Run `npx astro dev --root site --port 4322` and open that port instead.
- `npm run validate` lists problems: each line is file, line number, field and what to change. Fix only what it names and run it again.
- A test fails: read the first failure, not the last. The file and line are in the output.
- Windows: use Git Bash or PowerShell; every command above works in both. If a path in an error has backslashes, that is normal.
- Anything else: ask on your stage issue with the exact command and the exact output. Asking never costs you anything.

## Repository map

| Path                     | What lives there                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `contributors/<handle>/` | One directory per contributor: `profile.yml`, `page.md`, `.practice.json`, and `test_profile.py` or `profile.test.ts` by track. |
| `cohorts/<id>/`          | One `cohort.yml` per cohort, with each member's track.                                                                          |
| `py/nest_data/`          | The python track: the data step, page-status, scaffolds and the defect bank.                                                    |
| `packages/schema/`       | The js track's schemas and loaders, held to nest_data's behaviour by goldens.                                                   |
| `packages/cli/`          | The js track's `nest` command: scaffold, enrolment and stage issues.                                                            |
| `site/`                  | The Astro site, built from `site/.nest/data.json`. No network at build.                                                         |
| `stages/`                | The issue body for each stage of the ladder, per track for 1, 3, 4 and 5.                                                       |
| `docs/`                  | Contributing guide, decisions, privacy, roadmap, enrolment, build log.                                                          |

## How evidence is labelled

Pages keep three kinds of work apart and never dress one up as another:

- external: work accepted by projects outside Nest, listed by the page owner
- shared: contributions merged into Nest's own shared code
- practice: pull requests to the owner's own directory

Every marker on the site carries an icon and a text label. Colour alone is never the signal.

## Documents

- [Contributing](docs/CONTRIBUTING.md): the first pull request, step by step. [Development](docs/DEVELOPMENT.md) for the setup alone.
- [Enrolment](docs/ENROLMENT.md): how a person gets their directory, invitation and stage issues.
- [Roadmap](docs/roadmap.md) and [decisions](docs/adr/).
- [Privacy](docs/PRIVACY.md), [governance](docs/GOVERNANCE.md), [code of conduct](CODE_OF_CONDUCT.md), [security](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
