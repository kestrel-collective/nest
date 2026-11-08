"""The few JavaScript behaviours the data rules depend on, so nest_data and @nest/schema agree byte for byte.

String length is counted in UTF-16 code units, as JavaScript's ``.length`` does, so an emoji counts as two.
``trim`` removes exactly the characters ``String.prototype.trim`` removes. ``dumps`` writes JSON the way
``JSON.stringify(value, null, 2)`` does.
"""

from __future__ import annotations

import json
import math
from typing import Any

# ECMAScript WhiteSpace and LineTerminator: what String.prototype.trim and the regex class \s match.
_JS_SPACE_CODES = (
    0x09,
    0x0A,
    0x0B,
    0x0C,
    0x0D,
    0x20,
    0xA0,
    0x1680,
    *range(0x2000, 0x200B),
    0x2028,
    0x2029,
    0x202F,
    0x205F,
    0x3000,
    0xFEFF,
)
JS_SPACE = "".join(chr(c) for c in _JS_SPACE_CODES)
#: The regex class matching one JavaScript ``\s`` character.
JS_SPACE_CLASS = "[" + "".join(f"\\u{ord(c):04x}" for c in JS_SPACE) + "]"


def trim(text: str) -> str:
    """String.prototype.trim."""
    return text.strip(JS_SPACE)


def length(text: str) -> int:
    """String.prototype.length: UTF-16 code units, not code points."""
    return sum(2 if ord(ch) > 0xFFFF else 1 for ch in text)


def is_number(value: Any) -> bool:
    """typeof value === 'number'. bool is an int in Python, but never a number in JavaScript."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_integer(value: Any) -> bool:
    """Number.isInteger."""
    if not is_number(value):
        return False
    if isinstance(value, int):
        return True
    return math.isfinite(value) and value.is_integer()


def normalize_number(value: Any) -> Any:
    """A JavaScript number has no int/float split: 2.0 is 2, and is written as 2."""
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    return value


def js_string(value: Any) -> str:
    """String(value) for the scalars YAML can produce: how a mapping key becomes a property name."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, float):
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        value = normalize_number(value)
    return str(value)


def dumps(value: Any) -> str:
    """JSON.stringify(value, null, 2): two-space indent, no ASCII escaping, integral floats as integers."""
    return json.dumps(_plain(value), indent=2, ensure_ascii=False)


def _plain(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return normalize_number(value)
    return value


def loads(text: str) -> Any:
    """JSON.parse: NaN and Infinity are not JSON, and a leading byte order mark is refused."""

    def refuse(name: str) -> Any:
        raise ValueError(f"{name} is not valid JSON")

    return json.loads(text, parse_constant=refuse)
