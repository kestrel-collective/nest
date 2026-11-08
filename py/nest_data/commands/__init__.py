"""Commands beyond the four data commands in cli.py: practice counts, the scaffold and the defect bank."""

from __future__ import annotations

from typing import Any


def register(sub: Any) -> None:
    """Adds each command's parser. Each sets ``run(config, args, out, err) -> int`` as its default."""
    from . import practice_counts

    practice_counts.register(sub)
