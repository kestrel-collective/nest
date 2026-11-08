"""Stage progress and practice counts, ported from packages/cli/src/practice.test.ts, plus their edge cases."""

from __future__ import annotations

import json
from pathlib import Path

from nest_data.files import read_practice, stages_done
from nest_data.practice import ClosedIssue, MergedPr, compute_practice, write_practice_file

PRS = [
    MergedPr(1, "test-one", ["CONTRIBUTORS.md"]),
    MergedPr(2, "test-one", ["contributors/test-one/profile.yml"]),
    MergedPr(3, "Test-One", ["contributors/test-one/page.md", "contributors/test-one/test_profile.py"]),
    MergedPr(4, "test-one", ["py/nest_data/page.py"]),
    MergedPr(5, "test-two", ["contributors/test-two/profile.yml"]),
    MergedPr(6, "test-one", ["contributors/test-two/profile.yml"]),
    MergedPr(7, "test-one", []),
    MergedPr(8, "test-one", ["contributors\\test-one\\page.md"]),
]
ISSUES = [
    ClosedIssue(["test-one"], ["onboarding", "stage:1", "cohort:2027-01"]),
    ClosedIssue(["test-one"], ["onboarding", "stage:2"]),
    ClosedIssue(["test-two"], ["onboarding", "stage:3"]),
    ClosedIssue(["test-one"], ["bug"]),
    ClosedIssue(["TEST-ONE"], ["onboarding", "stage:9", "stage:7"]),
]


def test_own_directory_is_practice_and_anything_outside_contributors_is_shared() -> None:
    p = compute_practice("test-one", PRS, ISSUES, "2027-03-01T00:00:00Z")
    assert p == {
        "updated_at": "2027-03-01T00:00:00Z",
        "practice": 3,
        "shared": 2,
        "stages_done": [1, 2, 5, 7],
    }


def test_a_pull_request_into_someone_elses_directory_counts_as_nothing() -> None:
    p = compute_practice("test-two", PRS, ISSUES, "now")
    assert (p["practice"], p["shared"], p["stages_done"]) == (1, 0, [3])


def test_a_handle_with_nothing_merged_gets_zeros() -> None:
    assert compute_practice("test-three", PRS, ISSUES, "now") == {
        "updated_at": "now",
        "practice": 0,
        "shared": 0,
        "stages_done": [],
    }


def test_the_file_is_written_once_and_left_alone_when_only_the_time_differs(tmp_path: Path) -> None:
    (tmp_path / "contributors" / "test-one").mkdir(parents=True)
    first = compute_practice("test-one", PRS, ISSUES, "2027-03-01T00:00:00Z")
    assert write_practice_file(tmp_path, "test-one", first) == "written"
    again = compute_practice("test-one", PRS, ISSUES, "2027-03-02T00:00:00Z")
    assert write_practice_file(tmp_path, "test-one", again) == "unchanged"
    path = tmp_path / "contributors" / "test-one" / ".practice.json"
    assert json.loads(path.read_text())["updated_at"] == "2027-03-01T00:00:00Z"
    assert path.read_text().startswith('{\n  "updated_at": "2027-03-01T00:00:00Z",\n  "practice": 3,')
    assert write_practice_file(tmp_path, "test-one", {**again, "shared": 3}) == "written"


def test_an_unreadable_file_is_rewritten(tmp_path: Path) -> None:
    (tmp_path / "contributors" / "test-one").mkdir(parents=True)
    (tmp_path / "contributors" / "test-one" / ".practice.json").write_text("{nope")
    assert write_practice_file(tmp_path, "test-one", compute_practice("test-one", [], [], "now")) == "written"


def test_the_stage_is_the_number_of_distinct_stages() -> None:
    assert stages_done({"stages_done": []}) == 0
    assert stages_done({"stages_done": [1, 2, 5]}) == 3
    assert stages_done({"stages_done": [3, 1, 3]}) == 2


def test_a_missing_practice_file_reads_as_zero_counts(tmp_path: Path) -> None:
    issues: list = []
    p = read_practice(tmp_path / ".practice.json", "x/.practice.json", issues)
    assert p == {"updated_at": "1970-01-01T00:00:00Z", "practice": 0, "shared": 0, "stages_done": []}
    assert issues == []
    p["stages_done"].append(1)  # each read gets its own list
    assert read_practice(tmp_path / ".practice.json", "x", [])["stages_done"] == []


def test_counts_written_as_floats_are_integers(tmp_path: Path) -> None:
    path = tmp_path / ".practice.json"
    path.write_text('{"updated_at":"2027-01-01T00:00:00Z","practice":2.0,"shared":1e0,"stages_done":[1.0]}')
    issues: list = []
    assert read_practice(path, "x", issues) == {
        "updated_at": "2027-01-01T00:00:00Z",
        "practice": 2,
        "shared": 1,
        "stages_done": [1],
    }
    assert issues == []
