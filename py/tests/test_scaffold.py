"""The python-track scaffold: the same profile.yml and page.md as the js track, the same draws, the same findings."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from nest_data.config import read_config
from nest_data.contributor import validate_contributor
from nest_data.defects import DEFECTS, detect_defects, pick_defect
from nest_data.defects.selection import read_assigned
from nest_data.repo import validate_cohort
from nest_data.scaffold import plan_scaffold, scaffold

GOLDEN = Path(__file__).parent / "golden"
SCAFFOLDS = json.loads((GOLDEN / "scaffold-cases.json").read_text(encoding="utf-8"))
PICKS = json.loads((GOLDEN / "pick-cases.json").read_text(encoding="utf-8"))
COHORT = "id: 2027-01\nname: January 2027 cohort\nstarts: 2027-01-12\nends: 2027-04-30\nmembers: []\n"


@pytest.fixture
def repo(make_repo) -> Path:
    return make_repo({"cohorts/2027-01/cohort.yml": COHORT})


@pytest.mark.parametrize(
    "case", SCAFFOLDS, ids=[f"{c['handle']}:{c['cohort']}:{c['defect']}" for c in SCAFFOLDS]
)
def test_shared_files_and_findings_match_the_js_track(repo: Path, case: dict) -> None:
    config = read_config(repo)
    plan = plan_scaffold(config, case["handle"], case["cohort"], case["defect"], today="2027-02-03")
    assert plan.files["profile.yml"] == case["files"]["profile.yml"]
    assert plan.files["page.md"] == case["files"]["page.md"]
    d = repo / "contributors" / case["handle"]
    d.mkdir(parents=True, exist_ok=True)
    for name, text in plan.files.items():
        (d / name).write_text(text, encoding="utf-8")
    c, _ = validate_contributor(repo, case["handle"])
    cohort = None if case["cohort"] == "none" else validate_cohort(repo, "2027-01")[0]
    found = [[defect.id, finding] for defect, finding in detect_defects(c, cohort)] if c else []
    assert found == case["detected"]


@pytest.mark.parametrize(
    "case", PICKS, ids=[f"{c['handle']}:t{c['tier']}:{c['cohortless']}:{len(c['used'])}" for c in PICKS]
)
def test_each_handle_draws_the_same_defect_as_on_the_js_track(case: dict) -> None:
    pick = pick_defect(
        case["handle"], case["cohortless"], tier=case["tier"], used=set(case["used"]), bank=DEFECTS
    )
    assert pick.id == case["pick"]


def test_a_python_scaffold_validates_and_carries_its_own_test(repo: Path) -> None:
    result = scaffold(read_config(repo), "test-one", "2027-01", today="2027-01-12")
    assert sorted(result.files) == ["README.md", "page.md", "profile.yml", "test_profile.py"]
    _, issues = validate_contributor(repo, "test-one")
    assert issues == []
    assert "pytest" in result.files["README.md"]
    assert 'HANDLE = "test-one"' in result.files["test_profile.py"]
    assert read_assigned(repo, "2027-01") == {"test-one": result.defect.id}


def test_the_scaffold_test_passes_on_the_scaffold(repo: Path) -> None:
    result = scaffold(read_config(repo), "test-one", "2027-01", defect="name-is-handle")
    namespace: dict = {"__file__": str(result.dir / "test_profile.py")}
    exec(compile(result.files["test_profile.py"], "test_profile.py", "exec"), namespace)
    namespace["test_validates_without_problems"]()


def test_a_second_member_of_a_cohort_gets_another_defect(repo: Path) -> None:
    config = read_config(repo)
    first = scaffold(config, "test-one", "2027-01")
    second = scaffold(config, "test-two", "2027-01")
    assert first.defect.id != second.defect.id


def test_scaffold_refuses_to_overwrite_and_names_bad_handles(repo: Path) -> None:
    from nest_data.config import UsageError

    config = read_config(repo)
    scaffold(config, "test-one", "2027-01")
    with pytest.raises(UsageError, match="already exists"):
        scaffold(config, "test-one", "2027-01")
    with pytest.raises(UsageError, match="lower case"):
        plan_scaffold(config, "Test-One", "2027-01")
