"""YAML read the way the Node ``yaml`` package reads it: YAML 1.2 with the core schema, keeping lines for messages.

PyYAML implements YAML 1.1, where ``yes``, ``on`` and ``no`` are booleans, ``1_000`` is a number and
``2027-01-12`` is a date. In YAML 1.2, and so in @nest/schema, all of those are strings. This module
composes the document with PyYAML and builds the values itself, with the 1.2 core schema's rules, so a
profile means the same thing to both. Like the ``yaml`` package it refuses duplicate keys, does not apply
``<<`` merge keys, and turns mapping keys into strings.
"""

from __future__ import annotations

import math
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import yaml
from yaml.nodes import MappingNode, Node, ScalarNode, SequenceNode

from .issues import ValidationIssue
from .jsutil import js_string

STR = "tag:yaml.org,2002:str"
INT = "tag:yaml.org,2002:int"
FLOAT = "tag:yaml.org,2002:float"
BOOL = "tag:yaml.org,2002:bool"
NULL = "tag:yaml.org,2002:null"


class _CoreLoader(yaml.SafeLoader):
    """Composes nodes with the YAML 1.2 core schema's implicit tags instead of YAML 1.1's."""


_CoreLoader.yaml_implicit_resolvers = {}
for _tag, _pattern in [
    (NULL, r"^(?:~|[Nn]ull|NULL)?$"),
    (BOOL, r"^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$"),
    (INT, r"^(?:0o[0-7]+|[-+]?[0-9]+|0x[0-9a-fA-F]+)$"),
    (FLOAT, r"^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$"),
    (FLOAT, r"^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$"),
    (FLOAT, r"^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$"),
]:
    _CoreLoader.add_implicit_resolver(_tag, re.compile(_pattern, re.ASCII), None)


class YamlError(Exception):
    def __init__(self, message: str, line: int):
        super().__init__(message)
        self.line = line


def _scalar(node: ScalarNode) -> Any:
    tag, text = node.tag, node.value
    if tag in (STR, "!"):
        return text
    if tag == NULL:
        return None
    if tag == BOOL:
        return text.lower() == "true"
    if tag == INT:
        try:
            if text.startswith("0o"):
                return int(text[2:], 8)
            if text.startswith("0x"):
                return int(text[2:], 16)
            return int(text, 10)
        except ValueError:
            return text
    if tag == FLOAT:
        low = text.lower()
        if low.endswith(".inf"):
            return -math.inf if low.startswith("-") else math.inf
        if low == ".nan":
            return math.nan
        try:
            return float(text)
        except ValueError:
            return text
    return text  # an unknown tag keeps the text, as the yaml package does


def _key(node: Node) -> str:
    if isinstance(node, ScalarNode):
        return js_string(_scalar(node))
    return js_string(_build(node))


def _build(node: Node) -> Any:
    if isinstance(node, ScalarNode):
        return _scalar(node)
    if isinstance(node, SequenceNode):
        return [_build(item) for item in node.value]
    if isinstance(node, MappingNode):
        out: dict[str, Any] = {}
        seen: set[tuple[str, Any]] = set()
        for key_node, value_node in node.value:
            ident = ("scalar", key_node.value) if isinstance(key_node, ScalarNode) else ("node", id(key_node))
            if ident in seen:
                raise YamlError("Map keys must be unique", key_node.start_mark.line + 1)
            seen.add(ident)
            out[_key(key_node)] = _build(value_node)
        return out
    raise YamlError("Unsupported YAML node", node.start_mark.line + 1)  # pragma: no cover


def compose(text: str) -> Node | None:
    """The document's root node, or None for an empty one. Raises YamlError with a 1-based line."""
    try:
        return yaml.compose(text, Loader=_CoreLoader)
    except yaml.MarkedYAMLError as e:
        mark = e.problem_mark or e.context_mark
        problem = (e.problem or e.context or "Check the indentation and punctuation.").strip()
        line = (mark.line + 1) if mark is not None else 1
        raise YamlError(problem[:1].upper() + problem[1:], line) from e
    except yaml.YAMLError as e:
        raise YamlError(str(e).split("\n")[0], 1) from e


def load(text: str) -> Any:
    """The document's value, read as YAML 1.2 core. Raises YamlError."""
    node = compose(text)
    return None if node is None else _build(node)


@dataclass
class YamlFile:
    data: Any
    #: Syntax problems, already in plain words. Empty when the file parsed.
    syntax_issues: list[ValidationIssue] = field(default_factory=list)
    root: Node | None = None

    def node_at(self, path: Sequence[str | int]) -> Node | None:
        node = self.root
        for part in path:
            if node is None:
                return None
            if isinstance(node, MappingNode):
                key = str(part)
                node = next((v for k, v in node.value if _key(k) == key), None)
            elif isinstance(node, SequenceNode) and isinstance(part, int):
                node = node.value[part] if 0 <= part < len(node.value) else None
            else:
                return None
        return node

    def line_of(self, path: Sequence[str | int]) -> int | None:
        node = self.node_at(path)
        return None if node is None else node.start_mark.line + 1

    def key_line_of(self, path: Sequence[str | int], key: str) -> int | None:
        node = self.node_at(path)
        if not isinstance(node, MappingNode):
            return None
        for k, _v in node.value:
            if _key(k) == key:
                return k.start_mark.line + 1
        return None


def read_yaml(text: str, file: str) -> YamlFile:
    """Parses YAML and keeps enough of the document to point at lines in error messages. Mirrors yaml.ts."""
    try:
        root = compose(text)
        data = None if root is None else _build(root)
    except YamlError as e:
        first = str(e).split("\n")[0] or "Check the indentation and punctuation."
        issue = ValidationIssue(
            file=file, line=e.line, field="(file)", message=f"could not be read as YAML. {first}"
        )
        return YamlFile(data=None, syntax_issues=[issue])
    result = YamlFile(data=data, root=root)
    if data is None or not isinstance(data, dict):
        result.syntax_issues.append(
            ValidationIssue(
                file=file,
                line=1,
                field="(file)",
                message="must contain a mapping of fields, one per line, like name: Your Name.",
            )
        )
        result.data = None
    return result
