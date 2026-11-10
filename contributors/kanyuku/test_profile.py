"""The tests that guard the page of @kanyuku. pytest runs them on every pull request."""

from pathlib import Path

from nest_data.contributor import validate_contributor

# The repository root, two directories up from this file.
ROOT = Path(__file__).resolve().parents[2]
HANDLE = "kanyuku"


def test_validates_without_problems():
    _contributor, issues = validate_contributor(ROOT, HANDLE)
    assert issues == []


def test_name_is_not_the_handle():
    contributor, issues = validate_contributor(ROOT, HANDLE)
    assert issues == []
    assert contributor["profile"]["name"] != contributor["profile"]["handle"]


# Stage 4: add the test that would have caught the defect you fixed in Stage 3.
# Start from the shape of the test above. It should fail with the defect and pass without it.
