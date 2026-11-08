"""The python track's bank of planted defects (ADR 0004, 0009, 0010).

Every scaffold ships with one planted defect. Each passes ``nest validate``, so the scaffold pull request is
green, and each is visible on the live page once it is public. Stage 3 is finding and fixing it. Stage 4 is
writing the pytest that would have caught it.

The first five are tier 1 and exist on both tracks: the same edit to the scaffold plan, and a detector that
says the same sentence as its twin in packages/cli/src/defects.ts (tests/golden/scaffold-cases.json). Defects
promoted from python candidates are numbered from 6 and listed in ``bank.py``; BANK is the whole set.

Detectors compare against the cohort window, never against today, because scaffolds are opened before a
cohort starts.
"""

from __future__ import annotations

import datetime as _dt
import importlib
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from ..page import PAGE_SECTIONS, is_placeholder
from ..templates import ScaffoldPlan

TIERS = (1, 2, 3)
COMPETENCIES = ("debugging", "automated-testing", "technical-communication")

Contributor = dict[str, Any]
Cohort = dict[str, Any]


@dataclass(frozen=True)
class Defect:
    id: str
    tier: int
    competency: str
    #: What the owner sees on the live page. Used in maintainer output only.
    symptom: str
    apply: Callable[[ScaffoldPlan], None]
    #: One sentence naming the problem when present, or None. This is what a Stage 4 test asserts.
    detect: Callable[[Contributor, Cohort | None], str | None]
    #: True when the detector needs a cohort, so the defect is never planted for an individual joiner.
    needs_cohort: bool = False
    number: int = 0


def _shift_year(date: str, years: int) -> str:
    return f"{int(date[:4]) + years}{date[4:]}"


def _joined_after(c: Contributor, cohort: Cohort | None) -> str | None:
    own = cohort if cohort is not None and c["profile"].get("cohort") == cohort["id"] else None
    limit = own["ends"] if own else f"{_dt.datetime.now(_dt.UTC).year + 1}-12-31"
    joined = c["profile"]["joined"]
    if joined <= limit:
        return None
    if own:
        return f"joined is {joined}, after cohort {own['id']} ended on {own['ends']}."
    return f"joined is {joined}, which is in the future."


def _joined_before(c: Contributor, cohort: Cohort | None) -> str | None:
    if (
        cohort is None
        or c["profile"].get("cohort") != cohort["id"]
        or c["profile"]["joined"] >= cohort["starts"]
    ):
        return None
    return f"joined is {c['profile']['joined']}, before cohort {cohort['id']} started on {cohort['starts']}."


def _sections_out_of_order(c: Contributor, _cohort: Cohort | None) -> str | None:
    order = [s["title"] for s in c["page"]["sections"]]
    expected = [t for t in PAGE_SECTIONS if t in order]
    if order == expected:
        return None
    return f"page.md sections are in the order {', '.join(order)}; expected {', '.join(expected)}."


def _placeholder_next(c: Contributor, _cohort: Cohort | None) -> str | None:
    nxt = c["profile"].get("next")
    return "next still has the template text." if nxt is not None and is_placeholder(nxt) else None


def _name_is_handle(c: Contributor, _cohort: Cohort | None) -> str | None:
    name = c["profile"]["name"]
    return f'name is "{name}", the same as the handle.' if name.lower() == c["handle"].lower() else None


def _set(attr: str, value: Any) -> Callable[[ScaffoldPlan], None]:
    return lambda plan: setattr(plan, attr, value)


DEFECTS: tuple[Defect, ...] = (
    Defect(
        id="joined-after-cohort",
        number=1,
        tier=1,
        competency="debugging",
        symptom="The page says the owner joined fifty years from now.",
        apply=lambda plan: setattr(plan, "joined", _shift_year(plan.joined, 50)),
        detect=_joined_after,
    ),
    Defect(
        id="joined-before-cohort",
        number=2,
        tier=1,
        competency="debugging",
        needs_cohort=True,
        symptom="The page says the owner joined a year before their cohort started.",
        apply=lambda plan: setattr(plan, "joined", _shift_year(plan.joined, -1)),
        detect=_joined_before,
    ),
    Defect(
        id="sections-out-of-order",
        number=3,
        tier=1,
        competency="debugging",
        symptom='The page reads backwards: "What I am working on next" comes first.',
        apply=lambda plan: setattr(plan, "section_order", list(reversed(plan.section_order))),
        detect=_sections_out_of_order,
    ),
    Defect(
        id="placeholder-next",
        number=4,
        tier=1,
        competency="debugging",
        symptom='The page shows template text where "What I am working on next" should be.',
        apply=_set("next", "Replace this with the one thing you want to learn next."),
        detect=_placeholder_next,
    ),
    Defect(
        id="name-is-handle",
        number=5,
        tier=1,
        competency="debugging",
        symptom="The page shows the GitHub handle where the name should be.",
        apply=lambda plan: setattr(plan, "name", plan.handle),
        detect=_name_is_handle,
    ),
)


def _promoted() -> list[Defect]:
    """Python defects promoted from candidates, numbered from 6 (``bank.py``, written by defect-promote)."""
    from .bank import PROMOTED

    out = []
    for number, module in PROMOTED:
        mod = importlib.import_module(f"{__name__}.promoted.{module}")
        d: Defect = mod.DEFECT
        out.append(Defect(**{**d.__dict__, "number": number}))
    return out


BANK: tuple[Defect, ...] = (*DEFECTS, *_promoted())


def defect_by_number_or_id(value: str, bank: Iterable[Defect] = BANK) -> Defect | None:
    return next((d for d in bank if d.id == value or str(d.number) == value), None)


def pick_defect(
    handle: str,
    cohortless: bool = False,
    tier: int = 1,
    used: set[str] | None = None,
    bank: Iterable[Defect] = BANK,
) -> Defect:
    """The same handle always gets the same defect, so a re-run of the scaffold is reproducible.

    Without a cohort, only defects that can be found without one are eligible. Within those, the cohort's
    tier, and within the tier the ones not used yet in the cohort (ADR 0009). The hash is the js track's.
    """
    bank = list(bank)
    eligible = [d for d in bank if not d.needs_cohort] if cohortless else bank
    in_tier = [d for d in eligible if d.tier == tier]
    pool_tier = in_tier or eligible
    fresh = [d for d in pool_tier if d.id not in used] if used is not None else pool_tier
    pool = fresh or pool_tier
    h = 0
    for ch in handle:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return pool[h % len(pool)]


def detect_defects(
    c: Contributor, cohort: Cohort | None, bank: Iterable[Defect] = BANK
) -> list[tuple[Defect, str]]:
    """Runs every detector. A clean directory returns an empty list."""
    out = []
    for defect in bank:
        finding = defect.detect(c, cohort)
        if finding:
            out.append((defect, finding))
    return out
