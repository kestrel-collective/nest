"""YAML read as YAML 1.2 core, as the Node yaml package reads it, snippet for snippet."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from nest_data.jsutil import dumps
from nest_data.yamlfile import YamlError, load

CASES = json.loads((Path(__file__).parent / "golden" / "yaml-cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=[json.dumps(c["text"])[:40] for c in CASES])
def test_yaml_case(case: dict) -> None:
    if case["error"]:
        with pytest.raises(YamlError):
            load(case["text"])
        return
    assert dumps(load(case["text"])) == dumps(case["data"])
