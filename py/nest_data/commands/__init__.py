"""Commands beyond the four data commands in cli.py: scaffold, practice counts and the defect bank."""

from __future__ import annotations

from typing import Any


def register(sub: Any) -> None:
    """Adds each command's parser. Each sets ``run(config, args, out, err) -> int``."""
