# Python candidate defects

Written by `nest defect-import` from the model output of a P2 round, for candidates whose track is python (docs/P2-defect-bank.md). Nothing here is in the bank: `nest defect-check` runs the gate and fills the status, and a maintainer promotes the ones that pass with `nest defect-promote <id>`.

A candidate is two files: `<id>.py`, which defines `DEFECT`, and `test_<id>.py`, the Stage 4 test a newcomer could write. The test runs only when the gate points it at a scaffold (`NEST_DEFECT_ROOT`), so a plain `pytest` skips it.

| id  | tier | competency | symptom | gate |
| --- | ---- | ---------- | ------- | ---- |
