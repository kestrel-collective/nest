"""Which defect a scaffold plants (ADR 0009). Mirrors packages/cli/src/defect-bank/selection.ts.

Within the tier the cohort names (cohort.yml defect_tier, default 1), from the handle, never one already used in
the cohort while the tier has an unused one. "Used" is cohorts/<id>/.defects.json, the record both tracks'
scaffolds write (gitignored), plus every defect still present in a cohort member's directory, whatever their
track.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path

from ..contributor import validate_contributor
from ..files import COHORTS_DIR, list_contributor_dirs
from ..jsutil import dumps
from ..repo import validate_cohort
from . import BANK, Defect, defect_by_number_or_id, detect_defects, pick_defect

DEFECTS_FILE = ".defects.json"


def _record_path(root: Path, cohort: str) -> Path:
    return Path(root) / COHORTS_DIR / cohort / DEFECTS_FILE


def read_assigned(root: Path, cohort: str) -> dict[str, str]:
    path = _record_path(root, cohort)
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        return {}
    assigned = data.get("assigned") if isinstance(data, dict) else None
    return assigned if isinstance(assigned, dict) else {}


def record_assigned(root: Path, cohort: str, handle: str, defect_id: str) -> None:
    if not (Path(root) / COHORTS_DIR / cohort).exists():
        return
    assigned = {**read_assigned(root, cohort), handle: defect_id}
    ordered = dict(sorted(assigned.items()))
    _record_path(root, cohort).write_bytes((dumps({"assigned": ordered}) + "\n").encode("utf-8"))


def used_in_cohort(root: Path, cohort: str, except_handle: str, bank: Iterable[Defect] = BANK) -> set[str]:
    """Defects already planted in the cohort: recorded, or still present in a member's directory."""
    used = {d for h, d in read_assigned(root, cohort).items() if h != except_handle}
    c, _ = validate_cohort(root, cohort)
    for d in list_contributor_dirs(root):
        if d == except_handle:
            continue
        member, _ = validate_contributor(root, d)
        if member is None or member["profile"].get("cohort") != cohort:
            continue
        for defect, _finding in detect_defects(member, c, bank):
            used.add(defect.id)
    return used


def choose_defect(
    root: Path, handle: str, cohort_id: str | None, tier: int, exists: bool, bank: Iterable[Defect] = BANK
) -> Defect:
    """The defect for a handle in a cohort, or for an individual joiner when cohort_id is None."""
    bank = list(bank)
    if cohort_id is None or not exists:
        return pick_defect(handle, cohort_id is None, tier=tier, bank=bank)
    recorded = read_assigned(root, cohort_id).get(handle)
    again = next((d for d in bank if d.id == recorded), None) if recorded else None
    if again is None and recorded:
        again = defect_by_number_or_id(recorded, bank)
    if again is not None:
        return again
    return pick_defect(
        handle, False, tier=tier, used=used_in_cohort(root, cohort_id, handle, bank), bank=bank
    )
