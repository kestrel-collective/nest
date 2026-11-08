"""Commands beyond the four data commands in cli.py: practice counts, the scaffold and the defect bank."""

from __future__ import annotations

from typing import Any


def register(sub: Any) -> None:
    """Adds each command's parser. Each sets ``run(config, args, out, err) -> int`` as its default."""
    from . import defect_cmds, practice_counts, scaffold_cmd

    practice_counts.register(sub)
    scaffold_cmd.register(sub)
    defect_cmds.register(sub)
