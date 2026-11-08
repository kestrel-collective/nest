"""nest_data does exactly what the Node data code did, for every fixture repository (tests/fixtures/README.md).

The goldens were recorded from @nest/schema and the Node CLI before the data step moved to Python (ADR 0010).
Validation output, the site data file's bytes and page-status output must all match. The one allowance: when
a file is not valid YAML, the sentence after "could not be read as YAML." is each library's own, and so is
the line it points at.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from nest_data.cli import run_validate
from nest_data.config import read_config
from nest_data.page_status import run_page_status
from nest_data.repo import validate_repo
from nest_data.site import build_index, serialize_index

HERE = Path(__file__).parent
REPOS = HERE / "fixtures" / "repos"
GOLDEN = HERE / "golden"
CASES = sorted(p.name for p in REPOS.iterdir() if p.is_dir())

_YAML_ERROR = re.compile(r"^(\S+?)(?::\d+)? \(file\): could not be read as YAML\. .*$")


def normal(line: str) -> str:
    """A YAML syntax message without the parser's own wording and line."""
    return _YAML_ERROR.sub(r"\1 (file): could not be read as YAML. <parser message>", line)


def golden(case: str) -> dict:
    return json.loads((GOLDEN / f"{case}.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def _no_running_repository(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GITHUB_REPOSITORY", raising=False)


@pytest.mark.parametrize("case", CASES)
def test_validate_output_matches_node(case: str) -> None:
    out: list[str] = []
    err: list[str] = []
    code = run_validate(read_config(REPOS / case), out.append, err.append)
    want = golden(case)["validate"]
    assert code == want["code"]
    assert out == want["out"]
    assert [normal(e) for e in err] == [normal(e) for e in want["err"]]


@pytest.mark.parametrize("case", CASES)
def test_index_bytes_match_node(case: str) -> None:
    result = validate_repo(REPOS / case)
    want = golden(case)["index"]
    if want is None:
        assert result.issues, "Node refused to write an index for this case, so it must have problems"
        return
    assert not result.issues
    release = json.loads((REPOS / case / "package.json").read_text(encoding="utf-8"))["version"]
    assert serialize_index(build_index(result, release)) == want


@pytest.mark.parametrize("case", CASES)
def test_page_status_matches_node(case: str) -> None:
    config = read_config(REPOS / case)
    for handle, want in golden(case)["page_status"].items():
        out: list[str] = []
        code = run_page_status(config, handle, out.append, lambda _line: None, local=True)
        assert (code, [normal(line.strip()) for line in out]) == (
            want["code"],
            [normal(line.strip()) for line in want["out"]],
        ), handle
