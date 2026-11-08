"""The P2 defect bank for both tracks: requests, python candidates, the gate and promotion (ADR 0009, 0010)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from nest_data import defect_bank as bank
from nest_data.cli import main
from nest_data.config import UsageError

REPO = Path(__file__).resolve().parents[2]

MODULE = """from nest_data.defects import Defect
from nest_data.page import is_placeholder
from nest_data.templates import ScaffoldPlan


def apply(plan: ScaffoldPlan) -> None:
    plan.skills = ["Replace this skill"]


def detect(c: dict, cohort: dict | None) -> str | None:
    for skill in c["profile"]["skills_developing"]:
        if is_placeholder(skill):
            return f'skills_developing lists "{skill}", the template text.'
    return None


DEFECT = Defect(
    id="skill-is-placeholder",
    tier=1,
    competency="debugging",
    symptom="The page lists a skill called Replace this skill.",
    apply=apply,
    detect=detect,
)
"""

TEST = """import os

import pytest

from nest_data.contributor import validate_contributor
from nest_data.page import is_placeholder

ROOT = os.environ.get("NEST_DEFECT_ROOT")
HANDLE = os.environ.get("NEST_DEFECT_HANDLE", "")

pytestmark = pytest.mark.skipif(not ROOT, reason="run by nest defect-check against a scaffold")


def test_no_skill_is_template_text():
    contributor, _issues = validate_contributor(ROOT, HANDLE)
    assert contributor is not None
    assert not any(is_placeholder(s) for s in contributor["profile"]["skills_developing"])
"""


def output(**over) -> str:
    obj = {
        "id": "skill-is-placeholder",
        "tier": 1,
        "competency": "debugging",
        "symptom": "The page lists a skill called Replace this skill.",
        "needs_cohort": False,
        "module": MODULE,
        "test": TEST,
        "notes": "A fair search — the skill chip shows template text.",
    }
    obj.update(over)
    return json.dumps(obj)


def row(text: str, request: str = "r1-02", prompt: str = "nest_defect_python_v1") -> dict:
    return {
        "id": request,
        "output": text,
        "model": "claude-opus-5-5",
        "prompt_version": prompt,
        "tokens": 1,
        "generated_at": "2027-01-01T00:00:00Z",
        "ok": True,
        "error": None,
    }


def test_a_round_alternates_tracks_and_carries_each_tracks_code() -> None:
    lines = bank.build_requests(REPO, 1)
    assert len(lines) == 20
    assert [line["prompt_version"] for line in lines[:2]] == ["nest_defect_v1", "nest_defect_python_v1"]
    js, py = lines[0]["inputs"], lines[1]["inputs"]
    assert js["slot"]["track"] == "js" and py["slot"]["track"] == "python"
    assert sorted(py["context"]) == sorted(bank.CONTEXT_FILES["python"])
    assert "class Defect" in py["context"]["defects_py"]
    assert "planted defect" in py["context"]["adr_0004"]
    assert set(bank.existing_ids(REPO)) >= {"joined-after-cohort", "name-is-handle"}
    assert py["slot"]["field"] in bank.FIELDS["python"]


def test_one_track_only_and_the_tier_spread_are_kept() -> None:
    python = bank.slots(1, track="python")
    assert {s.track for s in python} == {"python"}
    tiers = [s.tier for s in python]
    assert (tiers.count(1), tiers.count(2), tiers.count(3)) == (7, 8, 5)
    with pytest.raises(UsageError):
        bank.build_requests(REPO, 0)


def test_the_request_command_writes_the_file_and_names_both_prompts(tmp_path: Path, capsys) -> None:
    out = tmp_path / "round-1.jsonl"
    assert main(["--root", str(REPO), "defect-request", "--round", "1", "--out", str(out)]) == 0
    text = capsys.readouterr().out
    assert len(out.read_text(encoding="utf-8").splitlines()) == 20
    assert "Estimate: about" in text
    assert (
        "tools/defect-bank/nest_defect_v1.md" in text and "tools/defect-bank/nest_defect_python_v1.md" in text
    )


def test_a_good_python_candidate_is_accepted_and_bad_ones_say_why() -> None:
    candidate, problems = bank.parse_python_candidate(output(), set())
    assert problems == [] and candidate is not None
    _, taken = bank.parse_python_candidate(output(), {"skill-is-placeholder"})
    assert taken == ['id "skill-is-placeholder" is already taken']
    _, sneaky = bank.parse_python_candidate(
        output(module=MODULE.replace("from nest_data.page", "import subprocess\nfrom nest_data.page")), set()
    )
    assert "the module imports subprocess" in sneaky
    _, broken = bank.parse_python_candidate(output(test="def test(:\n"), set())
    assert any("not valid Python" in p for p in broken)
    assert bank.parse_python_candidate("not json", set())[1] == ["the output is not JSON"]


@pytest.fixture
def root(tmp_path: Path) -> Path:
    (tmp_path / bank.PY_CANDIDATES).mkdir(parents=True)
    (tmp_path / bank.PY_PROMOTED).mkdir(parents=True)
    return tmp_path


def test_import_writes_python_candidates_with_provenance_and_hands_js_rows_on(root: Path) -> None:
    result = bank.import_candidates(root, [row(output()), row("{}", "r1-01", "nest_defect_v1")])
    assert result.written == ["skill-is-placeholder"]
    assert [r["id"] for r in result.js_rows] == ["r1-01"]
    module = (root / bank.PY_CANDIDATES / "skill_is_placeholder.py").read_text(encoding="utf-8")
    assert module.startswith("# A planted defect from the P2 bank")
    assert "# model: claude-opus-5-5" in module and "# id: skill-is-placeholder" in module
    assert "—" not in module
    assert (root / bank.PY_CANDIDATES / "test_skill_is_placeholder.py").exists()
    assert "| skill-is-placeholder | 1 | debugging |" in (root / bank.PY_CANDIDATES / "README.md").read_text(
        encoding="utf-8"
    )


def test_the_gate_passes_a_good_candidate(root: Path) -> None:
    bank.import_candidates(root, [row(output())])
    outcome = bank.check_python_candidate(root, "skill-is-placeholder")
    assert (outcome.passed, outcome.reason, outcome.visible) == (True, "", True)


@pytest.mark.parametrize(
    ("module", "test", "reason"),
    [
        (
            MODULE.replace("return f'skills", "return None\n            return f'skills"),
            TEST,
            "the detector returns None",
        ),
        (
            MODULE.replace("        if is_placeholder(skill):", "        if skill or True:").replace(
                '    for skill in c["profile"]["skills_developing"]:',
                '    for skill in c["profile"]["skills_developing"] or ["x"]:',
            ),
            TEST,
            "the detector fires on a clean scaffold",
        ),
        (
            MODULE,
            TEST.replace("assert not any", "assert any(True for _ in [1]) or not any"),
            "the test passes with the defect planted",
        ),
        (MODULE.replace('["Replace this skill"]', '[""]'), TEST, "nest validate fails"),
    ],
    ids=["silent detector", "noisy detector", "test that never fails", "invalid scaffold"],
)
def test_the_gate_fails_a_broken_candidate_with_the_reason(
    root: Path, module: str, test: str, reason: str
) -> None:
    bank.import_candidates(root, [row(output(module=module, test=test))])
    outcome = bank.check_python_candidate(root, "skill-is-placeholder")
    assert not outcome.passed
    assert reason in outcome.reason


def test_promotion_numbers_across_both_tracks_and_writes_the_bank(root: Path) -> None:
    js_promoted = root / bank.JS_PROMOTED
    js_promoted.mkdir(parents=True)
    (js_promoted / "some-js-defect.ts").write_text("// number: 6\nexport default {}\n", encoding="utf-8")
    bank.import_candidates(root, [row(output())])
    with pytest.raises(UsageError, match="has not passed the gate"):
        bank.promote_python(root, "skill-is-placeholder")
    bank.record_checks(root, [bank.check_python_candidate(root, "skill-is-placeholder")])
    number, files = bank.promote_python(root, "skill-is-placeholder", by="A Maintainer")
    assert number == 7
    promoted = (root / bank.PY_PROMOTED / "skill_is_placeholder.py").read_text(encoding="utf-8")
    assert (
        "# number: 7" in promoted
        and "# promoted_by: A Maintainer" in promoted
        and "# status: promoted" in promoted
    )
    assert promoted.count("# A planted defect") == 1
    assert '(7, "skill_is_placeholder")' in (root / bank.PY_BANK_FILE).read_text(encoding="utf-8")
    assert not (root / bank.PY_CANDIDATES / "skill_is_placeholder.py").exists()
    assert bank.next_number(root) == 8
    assert len(files) == 3


def test_check_and_promote_name_an_unknown_candidate(root: Path, capsys) -> None:
    (root / "package.json").write_text('{"repository": "github:example-org/nest"}', encoding="utf-8")
    (root / "contributors").mkdir()
    assert main(["--root", str(root), "defect-check", "nothing-here"]) == 2
    assert "There is no candidate nothing-here" in capsys.readouterr().err
    assert main(["--root", str(root), "defect-check", "--all"]) == 0
    assert "No candidates to check." in capsys.readouterr().out
