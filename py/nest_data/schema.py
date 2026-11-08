"""The rules of profile.yml, cohort.yml and .practice.json, reporting problems the way @nest/schema does.

@nest/schema uses zod 4. Its problems come out in a particular order, with particular codes, and that order
reaches every contributor through ``nest validate``. This module reproduces what those schemas report and
what they output, value for value. ``tests/test_schema_cases.py`` holds it to about three thousand cases
recorded from the Node schemas (``tests/golden/schema-cases.json``).

The parts of zod's behaviour that matter here:

- A value of the wrong type gets ``invalid_type``. Length rules still run afterwards on anything with a
  length (a string or a list), so ``name: []`` is both "must be a string" and "needs at least 1 item".
- A list longer than its maximum is reported as too long and its items are not looked at.
- A missing key gets ``invalid_type`` with ``received: undefined`` (``is required.``); a missing enum gets
  ``invalid_value``; an optional key may be missing; a default fills a missing key.
- Unknown keys are reported after the known ones, as one issue per object.
- ``trim`` and ``url`` change the value: the output is trimmed, and a URL loses tabs and newlines.
"""

from __future__ import annotations

import copy
import re
from collections.abc import Callable
from typing import Any

from . import jsutil
from .handle import COHORT_ID_PATTERN
from .urls import can_parse_url

MISSING: Any = type("Missing", (), {"__repr__": lambda self: "MISSING"})()
FAIL: Any = type("Fail", (), {"__repr__": lambda self: "FAIL"})()

Issues = list[dict[str, Any]]
Path = list[str | int]

MAX_SAFE_INTEGER = 9007199254740991

# zod 4's ISO date: real days only, leap years included.
DATE_SOURCE = (
    r"(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:"
    r"(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))"
)
DATE = re.compile(rf"^{DATE_SOURCE}\Z", re.ASCII)
# zod 4's z.iso.datetime() with its defaults: seconds required, any fraction, Z only.
DATETIME = re.compile(rf"^{DATE_SOURCE}T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z))\Z", re.ASCII)


def _received(value: Any) -> str:
    return "undefined" if value is MISSING else type(value).__name__


def _has_length(value: Any) -> bool:
    return isinstance(value, (str, list))


def _length(value: Any) -> int:
    # zod counts a string's length in code points, so an emoji is one: the same as len() in Python
    return len(value)


def _origin(value: Any) -> str:
    return "string" if isinstance(value, str) else "array"


class Schema:
    def run(self, value: Any, path: Path, issues: Issues) -> Any:  # pragma: no cover - abstract
        raise NotImplementedError

    def parse(self, value: Any) -> tuple[Any, Issues]:
        issues: Issues = []
        out = self.run(value, [], issues)
        return (None if out is FAIL else out), issues


class _LengthCheck:
    def __init__(self, minimum: int | None = None, maximum: int | None = None):
        self.minimum = minimum
        self.maximum = maximum

    def check(self, value: Any, path: Path, issues: Issues) -> None:
        if not _has_length(value):
            return
        n = _length(value)
        if self.minimum is not None and n < self.minimum:
            issues.append(
                {"code": "too_small", "origin": _origin(value), "minimum": self.minimum, "path": path}
            )
        if self.maximum is not None and n > self.maximum:
            issues.append(
                {"code": "too_big", "origin": _origin(value), "maximum": self.maximum, "path": path}
            )


def min_length(n: int) -> _LengthCheck:
    return _LengthCheck(minimum=n)


def max_length(n: int) -> _LengthCheck:
    return _LengthCheck(maximum=n)


class Str(Schema):
    """z.string() with trim, length, regex and format rules, in the order given."""

    def __init__(self, *checks: Any):
        self.checks = checks

    def run(self, value: Any, path: Path, issues: Issues) -> Any:
        if not isinstance(value, str):
            issues.append(
                {"code": "invalid_type", "expected": "string", "received": _received(value), "path": path}
            )
            for check in self.checks:  # only length rules run after a type failure
                if isinstance(check, _LengthCheck):
                    check.check(value, path, issues)
            return FAIL
        start = len(issues)
        for check in self.checks:
            if check == "trim":
                value = jsutil.trim(value)
            elif isinstance(check, _LengthCheck):
                check.check(value, path, issues)
            elif check == "date":
                if not DATE.match(value):
                    issues.append({"code": "invalid_format", "format": "date", "path": path})
            elif check == "datetime":
                if not DATETIME.match(value):
                    issues.append({"code": "invalid_format", "format": "datetime", "path": path})
            elif check == "url":
                trimmed = jsutil.trim(value)
                if can_parse_url(trimmed):
                    value = re.sub(r"[\t\n\r]", "", trimmed)
                else:
                    issues.append({"code": "invalid_format", "format": "url", "path": path})
            elif isinstance(check, re.Pattern):
                if not check.search(value):
                    issues.append({"code": "invalid_format", "format": "regex", "path": path})
            else:  # pragma: no cover - a programming error
                raise ValueError(f"unknown string check {check!r}")
        return FAIL if len(issues) > start else value


class Int(Schema):
    """z.int() and z.number().int(): a safe integer, then minimum and maximum."""

    def __init__(self, minimum: int | None = None, maximum: int | None = None):
        self.minimum = minimum
        self.maximum = maximum

    def run(self, value: Any, path: Path, issues: Issues) -> Any:
        if not jsutil.is_number(value) or value != value:  # NaN is not a number to zod
            issues.append(
                {"code": "invalid_type", "expected": "number", "received": _received(value), "path": path}
            )
            return FAIL
        if not jsutil.is_integer(value):
            issues.append({"code": "invalid_type", "expected": "int", "received": "number", "path": path})
            return FAIL
        start = len(issues)
        if value > MAX_SAFE_INTEGER:
            issues.append({"code": "too_big", "origin": "int", "maximum": MAX_SAFE_INTEGER, "path": path})
        if value < -MAX_SAFE_INTEGER:
            issues.append({"code": "too_small", "origin": "int", "minimum": -MAX_SAFE_INTEGER, "path": path})
        if self.minimum is not None and value < self.minimum:
            issues.append({"code": "too_small", "origin": "number", "minimum": self.minimum, "path": path})
        if self.maximum is not None and value > self.maximum:
            issues.append({"code": "too_big", "origin": "number", "maximum": self.maximum, "path": path})
        return FAIL if len(issues) > start else jsutil.normalize_number(value)


class Enum(Schema):
    def __init__(self, values: list[str]):
        self.values = values

    def run(self, value: Any, path: Path, issues: Issues) -> Any:
        if isinstance(value, str) and value in self.values:
            return value
        issues.append({"code": "invalid_value", "values": list(self.values), "path": path})
        return FAIL


class Unknown(Schema):
    def run(self, value: Any, path: Path, issues: Issues) -> Any:
        return value


class Arr(Schema):
    """z.array(item) with a maximum: a list over the maximum is refused before its items are read."""

    def __init__(self, item: Schema, maximum: int | None = None):
        self.item = item
        self.maximum = maximum

    def run(self, value: Any, path: Path, issues: Issues) -> Any:
        if isinstance(value, list) and self.maximum is not None and len(value) > self.maximum:
            issues.append({"code": "too_big", "origin": "array", "maximum": self.maximum, "path": path})
            return FAIL
        if not isinstance(value, list):
            issues.append(
                {"code": "invalid_type", "expected": "array", "received": _received(value), "path": path}
            )
            if self.maximum is not None:
                max_length(self.maximum).check(value, path, issues)
            return FAIL
        start = len(issues)
        out = [self.item.run(v, [*path, i], issues) for i, v in enumerate(value)]
        return FAIL if len(issues) > start else out


class Optional(Schema):
    def __init__(self, inner: Schema):
        self.inner = inner

    def run(self, value: Any, path: Path, issues: Issues) -> Any:
        return MISSING if value is MISSING else self.inner.run(value, path, issues)


class Default(Schema):
    def __init__(self, inner: Schema, default: Any):
        self.inner = inner
        self.default = default

    def run(self, value: Any, path: Path, issues: Issues) -> Any:
        return copy.deepcopy(self.default) if value is MISSING else self.inner.run(value, path, issues)


class Obj(Schema):
    """z.strictObject(shape): known keys in shape order, then the unknown ones in one issue."""

    def __init__(self, shape: dict[str, Schema]):
        self.shape = shape

    def run(self, value: Any, path: Path, issues: Issues) -> Any:
        if not isinstance(value, dict):
            issues.append(
                {"code": "invalid_type", "expected": "object", "received": _received(value), "path": path}
            )
            return FAIL
        start = len(issues)
        out: dict[str, Any] = {}
        for key, schema in self.shape.items():
            result = schema.run(value.get(key, MISSING), [*path, key], issues)
            if result is not FAIL and result is not MISSING:
                out[key] = result
        unknown = [k for k in value if k not in self.shape]
        if unknown:
            issues.append({"code": "unrecognized_keys", "keys": unknown, "path": path})
        return FAIL if len(issues) > start else out


# ---------------------------------------------------------------- the three files

REPO_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")

PROJECT = Obj(
    {
        "title": Str("trim", min_length(1), max_length(120)),
        "repo": Str(REPO_SLUG_PATTERN),
        "url": Str("url"),
        "merged": Str("date"),
    }
)

PROFILE = Obj(
    {
        "handle": Str(min_length(1)),
        "name": Str("trim", min_length(1), max_length(80)),
        "cohort": Optional(Str(COHORT_ID_PATTERN)),
        "joined": Str("date"),
        "intro": Str("trim", min_length(1), max_length(280)),
        "skills_developing": Default(Arr(Str("trim", min_length(1), max_length(40)), maximum=8), []),
        "next": Optional(Str("trim", max_length(200))),
        "visibility": Obj({"page": Enum(["public", "private"])}),
        "projects": Default(Arr(PROJECT, maximum=50), []),
    }
)

COHORT_FILE = Obj(
    {
        "id": Str(COHORT_ID_PATTERN),
        "name": Str("trim", min_length(1), max_length(80)),
        "starts": Str("date"),
        "ends": Str("date"),
        "members": Arr(Unknown(), maximum=200),
        "defect_tier": Optional(Int(1, 3)),
    }
)

PRACTICE = Obj(
    {
        "updated_at": Str("datetime"),
        "practice": Int(0),
        "shared": Int(0),
        "stages_done": Arr(Int(1, 7), maximum=7),
    }
)

SCHEMAS: dict[str, Schema] = {"profile": PROFILE, "cohort": COHORT_FILE, "practice": PRACTICE}

ParseFn = Callable[[Any], "tuple[Any, Issues]"]
