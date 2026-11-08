# Parity fixtures

`repos/` holds small repositories, each a case the data code must handle: one that builds, one per kind of problem, YAML values that YAML 1.1 reads differently, and an empty one. Their bytes are kept exactly, Windows line endings included (`.gitattributes`), and Prettier leaves them alone (`.prettierignore`).

`../golden/<case>.json` is what the Node data code produced for each case before the switch to Python (ADR 0010): the `nest validate` output and exit code, the bytes of the site data file, and `nest page-status` for a few handles. `tests/test_parity.py` checks that `nest_data` produces exactly the same, and `packages/schema/src/parity.test.ts` checks that `@nest/schema`, the js track's library, still does too.

Regenerate the goldens only when a rule changes on purpose, and change both implementations in the same pull request:

```bash
python py/tests/fixtures/make_fixtures.py py/tests/fixtures/repos   # only when a fixture changes
npx tsc -b && node scripts/parity-goldens.mjs
```

`make_fixtures.py` is the source of every fixture file; edit it rather than the files under `repos/`.
