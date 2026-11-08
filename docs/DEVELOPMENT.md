# Development

How to get Nest running on your own machine and see it in a browser. For the first-pull-request walk-through see [CONTRIBUTING.md](CONTRIBUTING.md).

## Prerequisites

- Git. On Windows install Git for Windows; on macOS run `xcode-select --install`; on Linux use your package manager.
- On the python track: Python 3.11 or newer. On Windows install it from python.org and tick "Add python.exe to PATH"; on macOS use `brew install python@3.12` or python.org; on Linux use your package manager (the `python3` and `python3-venv` packages). Check with `python --version`, or `python3 --version`.
- On the js track: Node 20 or newer. Check with `node --version`. The `.nvmrc` file says `20` for version managers such as nvm.
- If you are a cohort member: the collaborator invitation GitHub emailed you, accepted. It also shows at the repository's invitations page.

## Setup on the python track

```bash
git clone https://github.com/kestrel-collective/nest.git
cd nest
python -m venv .venv
source .venv/bin/activate        # on Windows: .venv\Scripts\activate
pip install -e "py[dev]"
pytest
nest build-data
```

What you should see: `pip install` ends with "Successfully installed", and puts the `nest` command on your path while the virtual environment is active (your prompt starts with `(.venv)`). `pytest` ends with a line saying how many tests passed. `nest build-data` prints `Wrote site/.nest/data.json`. You see the site itself on the Cloudflare preview of every pull request; [py/README.md](../py/README.md) lists every command.

If you have Node too, `npm run dev` uses your Python for the data step, and the site reads the file `nest build-data` writes.

## Setup on the js track

```bash
git clone https://github.com/kestrel-collective/nest.git
cd nest
npm install
npm test
```

What you should see: `npm install` ends quietly after a minute or two; it also builds the `nest` command, so `npx nest --version` works straight after it. `npm test` ends with a line saying every test passed.

## See it in a browser

On the python track you do not need to run the site yourself. Every pull request gets a preview: Cloudflare posts a link on it a minute or two after you push, and that link is the whole site built from your branch, your page included once it is public. Before you push, `nest page-status your-handle --local` tells you whether the site would build your page, and what is in the way if not. If you have Node 20 or newer as well, `npm install` and `npm run dev` work as below, and use your Python for the data step.

On the js track:

```bash
npm run dev
```

Open http://localhost:4321/. The site rebuilds in the background every time you save a file; reload if a change does not appear. Press Ctrl+C in the terminal to stop.

- Your own page: http://localhost:4321/p/your-handle/. It exists only while `visibility.page` in your `profile.yml` is `public`; private pages are not built.
- Cohorts: http://localhost:4321/cohorts/.
- The feed the landing site reads: http://localhost:4321/api/pages.json.
- Another port, if 4321 is taken: `npx astro dev --root site --port 4322`.
- Exactly what production serves: `npm run build`, then `npm run preview`, then http://localhost:4321/.

## Everyday commands

On the python track, with the virtual environment active (your prompt starts with `(.venv)`):

| Command                  | What it does                                                             | What you should see                        |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------ |
| `nest validate`          | Checks every contributor and cohort file; CI runs the same thing.        | "no problems", or file:line and what to do |
| `pytest`                 | Runs nest_data's tests and every `test_*.py` in contributor directories. | "passed"                                   |
| `nest build-data`        | Writes `site/.nest/data.json`, the data the site is built from.          | "Wrote site/.nest/data.json"               |
| `nest page-status <you>` | Whether the site would build your page, and what is in the way.          | yes or no for each place, and why          |
| `ruff check py`          | The Python style check, for changes to `py/nest_data`.                   | "All checks passed!"                       |
| `ruff format py`         | Fixes the formatting of `py/nest_data`.                                  | The files it changed, if any               |
| `nest --help`            | The python track's `nest` and its commands.                              | A list of commands                         |

On the js track, every command starts with `npm run`, except `npm install` and `npm test`. `npm build` on its own prints "Unknown command".

| Command            | What it does                                                      | What you should see                         |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------- |
| `npm run dev`      | Runs the site locally with live reload.                           | A local address to open                     |
| `npm run validate` | Checks every contributor and cohort file; CI runs the same thing. | "no problems", or file:line and what to do  |
| `npm test`         | Runs every test, including the ones in contributor directories.   | "passed"                                    |
| `npm run lint`     | Formatting check and the em dash check.                           | "All matched files use Prettier code style" |
| `npm run format`   | Fixes formatting.                                                 | The files it changed, if any                |
| `npm run build`    | The data step, then the packages and the site into `site/dist`.   | "3 page(s) built" or more                   |
| `npm run preview`  | Serves the built site.                                            | A local address to open                     |
| `npx nest help`    | The `nest` command and its options.                               | A list of commands                          |

## The data step

The site does not read the contributor files itself. `npm run build` and `npm run dev` first run `scripts/data-step.mjs`, which runs `nest build-data` from `py/` to write `site/.nest/data.json`, and the site reads that file (ADR 0010). The step finds Python 3.11 or newer, installs nest_data's one dependency into `py/.deps` the first time, and is quick after that.

On a machine without Python the step says so, and the site computes the same data with `@nest/schema` instead, so the js track needs no Python. In CI and on Cloudflare a missing Python is an error. The goldens in `py/tests/golden` hold the two to the same bytes.

## Layout

- `py/nest_data`: the python track's code and the data step: validation, the site data, page-status, practice counts, python scaffolds and the defect bank. See [py/README.md](../py/README.md).
- `packages/schema`: the js track's copy of the rules every file follows, and the validation messages.
- `packages/cli`: the js track's `nest` command: scaffolds, enrolment and stage issues.
- `site`: the Astro site. Pages are in `site/src/pages`, styles in `site/src/styles`.
- `contributors/`, `cohorts/`, `stages/`: the data the site and the issues are built from.

## If something fails

- Read the first error, not the last. `nest validate` and `npm run validate` name the file, the line and the field. Test failures, from pytest or from `npm test`, show the file and line.
- `python: command not found`, or a version older than 3.11, on the python track: on macOS and Linux try `python3`; otherwise install Python 3.11 or newer (see Prerequisites) and make the virtual environment again.
- `Unknown command` on the js track: you left out `run`. It is `npm run build`, `npm run dev`, and so on.
- `is not supported by Astro` or `Unsupported engine` on the js track: your Node is too old. Install Node 20 or newer and run `npm install` again.
- `nest: command not found` on the python track: activate the virtual environment again in this terminal.
- `Cannot find module` or `nest: command not found` on the js track: run `npm install` again.
- `No module named nest_data` or `yaml`: run `pip install -e "py[dev]"` with the virtual environment active.
- `data step: ... Python 3.11 or later` in CI or on Cloudflare: the build needs Python there; on Cloudflare set `PYTHON_VERSION` (docs/REPO-SETTINGS.md).
- The site shows "There is no page here" for your page: it is still private, or the handle in the address differs from your directory name.
- Stuck for more than thirty minutes: say so on your stage issue, with the exact command and output. Asking never costs you anything.
