"""The python track's scaffold: contributors/<handle>/ with one planted defect (ADR 0004, 0009, 0010).

Mirrors packages/cli/src/commands/scaffold.ts. The js track's scaffold writes profile.test.ts; this one writes
test_profile.py, and plants from the python bank.
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from pathlib import Path

from .config import RepoConfig, UsageError
from .defects import BANK, Defect, defect_by_number_or_id
from .defects.selection import choose_defect, record_assigned
from .files import CONTRIBUTORS_DIR, list_cohort_ids
from .handle import explain_handle
from .repo import validate_cohort
from .templates import default_plan, render_all

NO_COHORT = "none"


@dataclass
class ScaffoldResult:
    dir: Path
    files: dict[str, str]
    defect: Defect | None
    #: The cohort id, or None for an individual joiner.
    cohort: str | None
    #: Whether cohorts/<id>/ exists, so the planted defect can be recorded there.
    cohort_exists: bool


@dataclass
class _Cohort:
    id: str | None
    starts: str | None
    tier: int
    exists: bool


def _resolve_cohort(config: RepoConfig, wanted: str | None) -> _Cohort:
    if wanted == NO_COHORT:
        return _Cohort(None, None, 1, False)
    ids = list_cohort_ids(config.root)
    if wanted is None:
        if len(ids) == 1:
            wanted = ids[0]
        elif not ids:
            raise UsageError(
                "No cohort exists yet. Pass --cohort <id>, for example --cohort 2027-01, or --cohort none."
            )
        else:
            raise UsageError(f"Several cohorts exist ({', '.join(ids)}). Pass --cohort <id>.")
    if wanted not in ids:
        return _Cohort(wanted, None, 1, False)
    cohort, _ = validate_cohort(config.root, wanted)
    return _Cohort(wanted, cohort["starts"] if cohort else None, (cohort or {}).get("defect_tier", 1), True)


def plan_scaffold(
    config: RepoConfig,
    handle: str,
    cohort: str | None = None,
    defect: str | None = None,
    today: str | None = None,
) -> ScaffoldResult:
    """Builds the files for a contributor directory without touching the disk."""
    why = explain_handle(handle)
    if why:
        raise UsageError(f"The handle {why}")
    c = _resolve_cohort(config, cohort)
    joined = c.starts or today or _dt.date.today().isoformat()
    plan = default_plan(handle, c.id, joined)
    chosen: Defect | None
    if defect == "none":
        chosen = None
    elif defect is None:
        chosen = choose_defect(config.root, handle, c.id, c.tier, c.exists)
    else:
        chosen = defect_by_number_or_id(defect)
        if chosen is None:
            raise UsageError(f'Unknown defect "{defect}". Use 1 to {len(BANK)}, an id, or none.')
    if chosen is not None:
        chosen.apply(plan)
    return ScaffoldResult(
        dir=Path(config.root) / CONTRIBUTORS_DIR / handle,
        files=render_all(plan, config.repo_url),
        defect=chosen,
        cohort=c.id,
        cohort_exists=c.exists,
    )


def scaffold(
    config: RepoConfig,
    handle: str,
    cohort: str | None = None,
    defect: str | None = None,
    today: str | None = None,
    force: bool = False,
) -> ScaffoldResult:
    """Writes the contributor directory. Refuses to overwrite unless force is set."""
    result = plan_scaffold(config, handle, cohort, defect, today)
    if result.dir.exists() and not force:
        raise UsageError(f"contributors/{handle}/ already exists. Pass --force to overwrite its files.")
    result.dir.mkdir(parents=True, exist_ok=True)
    for name, content in result.files.items():
        (result.dir / name).write_bytes(content.encode("utf-8"))
    # ADR 0009: the cohort's record of planted defects, so the next scaffold picks another
    if result.defect is not None and result.cohort is not None and result.cohort_exists:
        record_assigned(config.root, result.cohort, handle, result.defect.id)
    return result
