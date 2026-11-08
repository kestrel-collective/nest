"""``nest scaffold``: create contributors/<handle>/ for a python-track member, with one planted defect."""

from __future__ import annotations

import json
from typing import Any

from ..config import RepoConfig
from ..scaffold import plan_scaffold, scaffold


def register(sub: Any) -> None:
    p = sub.add_parser("scaffold", help="create contributors/<handle>/ for a python-track member")
    p.add_argument("handle")
    p.add_argument("--cohort", help="a cohort id, or none; left out, the only cohort")
    p.add_argument("--defect", help="a defect number or id, or none; left out, chosen from the handle")
    p.add_argument("--today", help="YYYY-MM-DD used when the cohort has no start date")
    p.add_argument("--force", action="store_true", help="overwrite an existing directory's files")
    p.add_argument("--plan", action="store_true", help="say what would be written and change nothing")
    p.add_argument("--json", action="store_true", help="print the result as JSON (for nest enroll)")
    p.set_defaults(run=run)


def run(config: RepoConfig, args: Any, out: Any, err: Any) -> int:
    make = plan_scaffold if args.plan else scaffold
    kwargs = {"cohort": args.cohort, "defect": args.defect, "today": args.today}
    if not args.plan:
        kwargs["force"] = args.force
    result = make(config, args.handle, **kwargs)
    if args.json:
        out(json.dumps({"defect": result.defect.id if result.defect else None, "files": list(result.files)}))
        return 0
    verb = "Would create" if args.plan else "Created"
    out(
        f"{verb} contributors/{args.handle}/ with {', '.join(result.files)} (cohort {result.cohort or 'none'})."
    )
    if result.defect is not None:
        out(f"Planted defect {result.defect.number}, {result.defect.id}: {result.defect.symptom}")
    return 0
