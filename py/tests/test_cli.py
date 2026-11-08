"""The data commands end to end: validate, build-data, feed and page-status, as the CLI runs them."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from nest_data.cli import main

from .conftest import PAGE, git_commit, profile


def run(root: Path, *args: str, capsys: pytest.CaptureFixture[str]) -> tuple[int, str, str]:
    code = main(["--root", str(root), *args])
    captured = capsys.readouterr()
    return code, captured.out, captured.err


def public_and_private(make_repo) -> Path:
    return make_repo(
        {
            "contributors/test-one/profile.yml": profile("test-one"),
            "contributors/test-one/page.md": PAGE,
            "contributors/test-two/profile.yml": profile("test-two", "private"),
            "contributors/test-two/page.md": PAGE,
        }
    )


def test_validate_counts_what_it_checked(make_repo, capsys) -> None:
    code, out, err = run(public_and_private(make_repo), "validate", capsys=capsys)
    assert (code, out, err) == (
        0,
        "Checked 2 contributor directories, 0 templates and 1 cohort: no problems.\n",
        "",
    )


def test_root_may_come_after_the_command(make_repo, capsys) -> None:
    root = public_and_private(make_repo)
    assert main(["validate", "--root", str(root)]) == 0
    capsys.readouterr()


def test_build_data_writes_the_published_pages_only(make_repo, capsys) -> None:
    root = public_and_private(make_repo)
    code, out, _ = run(root, "build-data", capsys=capsys)
    assert code == 0
    assert out == "Wrote site/.nest/data.json: 1 published page, 1 cohort.\n"
    index = json.loads((root / "site" / ".nest" / "data.json").read_text(encoding="utf-8"))
    assert [c["handle"] for c in index["contributors"]] == ["test-one"]
    assert index["contributors"][0]["stage"] == 0
    assert index["release"] == "9.9.9"
    assert index["format"] == 1


def test_build_data_refuses_a_repository_with_problems_and_writes_nothing(make_repo, capsys) -> None:
    root = make_repo(
        {"contributors/test-one/profile.yml": "handle: test-one\n", "contributors/test-one/page.md": PAGE}
    )
    code, _, err = run(root, "build-data", capsys=capsys)
    assert code == 1
    assert "contributors/test-one/profile.yml:1 name: is required." in err
    assert err.rstrip().endswith("Fix them first.")
    assert not (root / "site" / ".nest" / "data.json").exists()


def test_feed_has_the_agreed_shape(make_repo, capsys) -> None:
    code, out, _ = run(public_and_private(make_repo), "feed", capsys=capsys)
    feed = json.loads(out)
    assert code == 0
    assert list(feed) == ["generated_at", "release", "pages"]
    assert feed["pages"][0]["url"] == "https://nest.example.test/p/test-one/"
    assert list(feed["pages"][0]) == ["handle", "name", "intro", "cohort", "stage", "counts", "url"]


def test_page_status_reads_main_not_the_working_tree_unless_local(make_repo, capsys) -> None:
    root = make_repo(
        {
            "contributors/test-one/profile.yml": profile("test-one", "private"),
            "contributors/test-one/page.md": PAGE,
        }
    )
    git_commit(root, "private page")
    (root / "contributors" / "test-one" / "profile.yml").write_text(profile("test-one"))
    code, out, _ = run(root, "page-status", "test-one", "--ref", "main", capsys=capsys)
    assert code == 1
    assert out.startswith("Page status for @test-one on main (commit ")
    assert "visibility.page is private. Set it to public in a pull request." in out
    code, out, _ = run(root, "page-status", "@Test-One", "--local", capsys=capsys)
    assert code == 0
    assert "url               https://nest.example.test/p/test-one/" in out


def test_page_status_names_a_missing_profile_and_problems_elsewhere(make_repo, capsys) -> None:
    root = make_repo(
        {
            "contributors/test-one/profile.yml": profile("test-one", intro="Replace this."),
            "contributors/test-one/page.md": PAGE,
            "contributors/test-two/profile.yml": profile("test-two"),
            "contributors/test-two/page.md": PAGE,
        }
    )
    git_commit(root, "fixture")
    _, missing, _ = run(root, "page-status", "test-three", "--ref", "main", capsys=capsys)
    assert "is not on main. The scaffold pull request for @test-three has to be merged first." in missing
    code, blocked, _ = run(root, "page-status", "test-two", "--ref", "main", capsys=capsys)
    assert code == 1
    assert "site builds       no, 1 problem in the repository" in blocked
    assert "1 problem in other files stop the whole site from building" in blocked


def test_an_unknown_ref_is_a_usage_error(make_repo, capsys) -> None:
    root = public_and_private(make_repo)
    git_commit(root, "fixture")
    code, _, err = run(root, "page-status", "test-one", "--ref", "nope", capsys=capsys)
    assert code == 2
    assert '"nope" is not a git ref' in err
