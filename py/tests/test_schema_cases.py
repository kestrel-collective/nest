"""The schema rules, value for value: about three thousand inputs recorded from the Node schemas.

Each case changes one field of a valid profile, cohort or practice record (or removes it) and records the
problems zod reported, or the value it produced. tests/golden/schema-cases.json is written by
scripts/parity-goldens.mjs.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from nest_data.issues import format_issue, from_schema_issues, no_line
from nest_data.jsutil import dumps
from nest_data.schema import MISSING, SCHEMAS

GOLDEN = Path(__file__).parent / "golden" / "schema-cases.json"
CASES = json.loads(GOLDEN.read_text(encoding="utf-8"))
FILES = {"profile": "profile.yml", "cohort": "cohort.yml", "practice": ".practice.json"}
BASES = {
    "profile": {
        "handle": "test-one",
        "name": "Fixture",
        "cohort": "2027-01",
        "joined": "2027-01-12",
        "intro": "Fixture text.",
        "skills_developing": ["debugging"],
        "next": "Something.",
        "visibility": {"page": "public"},
        "projects": [
            {"title": "T", "repo": "owner/name", "url": "https://example.test/1", "merged": "2027-02-01"}
        ],
    },
    "cohort": {
        "id": "2027-01",
        "name": "January 2027 cohort",
        "starts": "2027-01-12",
        "ends": "2027-04-30",
        "members": ["test-one"],
        "defect_tier": 1,
    },
    "practice": {"updated_at": "2027-01-12T09:30:00Z", "practice": 1, "shared": 0, "stages_done": [1]},
}


def with_value(base: Any, path: list, value: Any) -> Any:
    if not path:
        return value
    data = copy.deepcopy(base)
    at = data
    for key in path[:-1]:
        at = at[key]
    if value is MISSING:
        # JavaScript's delete: nothing happens to an absent key, and a list item becomes a hole (undefined)
        if isinstance(at, list):
            at[path[-1]] = MISSING
        else:
            at.pop(path[-1], None)
    else:
        at[path[-1]] = value
    return data


def case_id(c: dict) -> str:
    value = "MISSING" if "value" not in c else json.dumps(c["value"], ensure_ascii=True)[:24]
    return f"{c['schema']}:{'.'.join(map(str, c['path'])) or '(root)'}={value}"


@pytest.mark.parametrize("case", CASES, ids=[case_id(c) for c in CASES])
def test_schema_case(case: dict) -> None:
    value = case.get("value", MISSING)
    data = with_value(BASES[case["schema"]], case["path"], value)
    output, issues = SCHEMAS[case["schema"]].parse(data)
    got = [format_issue(i) for i in from_schema_issues(issues, FILES[case["schema"]], no_line, no_line)]
    assert got == case["issues"]
    if not case["issues"]:
        assert dumps(output) == dumps(case["output"])
