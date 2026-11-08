# nest_data

The python track's code (ADR 0010): the package that reads every contributor's `profile.yml` and `page.md` and every `cohorts/*/cohort.yml`, checks them, computes stage progress and practice counts, and writes `site/.nest/data.json`, the file the Astro site is built from. CI and the Cloudflare Pages build run it as the data step. It also writes python-track scaffolds and runs the planted-defect bank for both tracks.

It needs Python 3.11 or newer and one package, PyYAML. It never needs Node; only js-track defect candidates do.

## Set it up

From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate        # on Windows: .venv\Scripts\activate
pip install -e "py[dev]"
pytest
```

`pip install -e` installs the package from this folder, so a change you make here is live at once, and puts the `nest` command on your path while the virtual environment is active. `[dev]` adds pytest and ruff.

## The commands

| Command                              | What it does                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `nest validate`                      | Checks every contributor and cohort file and names each problem's file, line and field.                      |
| `nest build-data`                    | Validates, then writes `site/.nest/data.json`. Writes nothing when anything is wrong.                        |
| `nest page-status <handle>`          | Whether the site would build a person's page from `main` (or `--ref`, or `--local`), and what is in the way. |
| `nest feed [--out <file>]`           | Prints the pages feed the Kestrel Collective site reads (`docs/feed.md`).                                    |
| `nest scaffold <handle>`             | Creates a python-track member's directory with one planted defect. `nest enroll --track python` calls it.    |
| `nest practice-counts`               | Writes every `.practice.json` from merged pull requests and closed stage issues. Needs the GitHub CLI.       |
| `nest defect-request --round <n>`    | Writes a round of requests for candidate defects, for either track or both.                                  |
| `nest defect-import <runner-output>` | Writes the runner's acceptable outputs as candidates.                                                        |
| `nest defect-check <id>` or `--all`  | Runs the gate on candidates of either track.                                                                 |
| `nest defect-promote <id>`           | Moves a candidate that passed into its track's bank, with the next number.                                   |

Every command finds the repository from the current directory, or takes `--root <dir>`. `python -m nest_data <command>` does the same as `nest <command>`.

## Checks before you push

```bash
ruff check py
ruff format --check py     # ruff format py fixes it
pytest
nest validate
nest build-data
```

CI runs ruff and pytest on Python 3.11 and 3.13.

## One behaviour, two libraries

The js track's library, `@nest/schema`, checks the same files with the same rules, because js members' tests use it and the js track needs no Python. The two are held to one behaviour by goldens recorded from the Node code: `py/tests/golden` has the validation output and data-file bytes for five fixture repositories, about three thousand single-field schema cases, YAML snippets, scaffolds and defect draws. `tests/test_parity.py` and its neighbours hold `nest_data` to them; `packages/cli/src/parity.test.ts` holds `@nest/schema` to them.

So a change that alters something a contributor sees (a message, a rule, the data file) changes both libraries in one pull request and regenerates the goldens, as `tests/fixtures/README.md` says. A change that only touches code nest_data alone has (page-status, the scaffold command, practice counts, the defect bank) needs nothing from the js track.

Two things that look odd and are on purpose. YAML is read as YAML 1.2 with the core schema, as the Node `yaml` package reads it, so `name: yes` is the text "yes" and dates stay text; PyYAML alone would read YAML 1.1. And `schema.py` reproduces the order and wording of zod's problems, because that order reaches every contributor through `nest validate`.
