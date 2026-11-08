"""Validation in plain sentences with file, line and field: the cases a first-time contributor meets most."""

from __future__ import annotations

from nest_data.issues import format_issue
from nest_data.repo import track_of, validate_cohort, validate_repo

from .conftest import PAGE, profile


def problems(root) -> list[str]:
    return [format_issue(i) for i in validate_repo(root).issues]


def test_a_valid_public_profile_has_no_problems(make_repo) -> None:
    root = make_repo(
        {"contributors/test-one/profile.yml": profile("test-one"), "contributors/test-one/page.md": PAGE}
    )
    assert problems(root) == []


def test_template_text_on_a_public_page_is_named_with_its_line(make_repo) -> None:
    root = make_repo(
        {
            "contributors/test-one/profile.yml": profile("test-one", intro="Replace this with a sentence."),
            "contributors/test-one/page.md": PAGE,
        }
    )
    assert problems(root) == [
        "contributors/test-one/profile.yml:5 intro: still has the template text. Write one or two sentences about yourself."
    ]


def test_template_text_is_fine_while_the_page_is_private(make_repo) -> None:
    root = make_repo(
        {
            "contributors/test-one/profile.yml": profile(
                "test-one", "private", intro="Replace this with a sentence."
            ),
            "contributors/test-one/page.md": PAGE,
        }
    )
    assert problems(root) == []


def test_a_misspelt_field_is_named(make_repo) -> None:
    text = profile("test-one").replace("intro:", "intor:")
    root = make_repo({"contributors/test-one/profile.yml": text, "contributors/test-one/page.md": PAGE})
    assert problems(root) == [
        "contributors/test-one/profile.yml:1 intro: is required.",
        "contributors/test-one/profile.yml:5 intor: is not a field in profile.yml. Check the spelling.",
    ]


def test_a_missing_page_and_a_stray_file_are_reported(make_repo) -> None:
    root = make_repo(
        {"contributors/test-one/profile.yml": profile("test-one"), "contributors/test-one/notes.txt": "x"}
    )
    assert problems(root) == [
        "contributors/test-one/notes.txt file: does not belong here. A contributor directory holds profile.yml, "
        "page.md, .practice.json, README.md, *.test.ts and test_*.py files only.",
        "contributors/test-one/page.md (file): is missing. Every contributor directory needs one, even if it only has the headings.",
    ]


def test_python_test_files_and_their_cache_belong_in_a_directory(make_repo) -> None:
    root = make_repo(
        {
            "contributors/test-one/profile.yml": profile("test-one"),
            "contributors/test-one/page.md": PAGE,
            "contributors/test-one/test_profile.py": "def test_x():\n    pass\n",
            "contributors/test-one/__pycache__/test_profile.cpython-311.pyc": "",
        }
    )
    assert problems(root) == []


def test_yaml_1_1_words_stay_text(make_repo) -> None:
    text = profile("test-one").replace("name: Fixture test-one", "name: yes")
    root = make_repo({"contributors/test-one/profile.yml": text, "contributors/test-one/page.md": PAGE})
    result = validate_repo(root)
    assert result.issues == []
    assert result.contributors[0]["profile"]["name"] == "yes"
    assert result.contributors[0]["profile"]["joined"] == "2027-01-12"


def test_cohort_members_carry_a_track_defaulting_to_js(make_repo) -> None:
    root = make_repo()
    cohort, issues = validate_cohort(root, "2027-01")
    assert issues == []
    assert cohort is not None
    assert cohort["members"] == ["test-one", "test-two"]
    assert cohort["tracks"] == {"test-one": "js", "test-two": "python"}
    assert (track_of(cohort, "test-one"), track_of(cohort, "test-two"), track_of(None, "x")) == (
        "js",
        "python",
        "js",
    )


def test_a_track_that_does_not_exist_is_refused(make_repo) -> None:
    root = make_repo(
        {
            "cohorts/2027-01/cohort.yml": "id: 2027-01\nname: N\nstarts: 2027-01-12\nends: 2027-04-30\n"
            "members:\n  - handle: test-one\n    track: rust\n"
        }
    )
    assert [format_issue(i) for i in validate_cohort(root, "2027-01")[1]] == [
        'cohorts/2027-01/cohort.yml:7 members[0].track: must be "js" or "python".'
    ]
