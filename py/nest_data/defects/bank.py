"""Written by ``nest defect-promote`` (docs/P2-defect-bank.md, ADR 0009, 0010). Do not edit by hand.

Python defects promoted from candidates, as (number, module name in promoted/). The first five live in
__init__.py and exist on both tracks.
"""

PROMOTED: list[tuple[int, str]] = []
