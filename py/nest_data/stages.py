"""The onboarding ladder. Mirrors packages/schema/src/stages.ts. Stage 5 is the only stage worked in shared code."""

from __future__ import annotations

from typing import NamedTuple


class Stage(NamedTuple):
    number: int
    slug: str
    title: str
    short: str


STAGES = (
    Stage(1, "make-it-run", "Make it run", "Clone, test, first PR"),
    Stage(2, "your-page-exists", "Your page exists", "Profile, preview, live"),
    Stage(3, "fix-your-defect", "Fix your defect", "Reproduce, hypothesise, fix"),
    Stage(4, "write-the-test", "Write the test", "Fails before, passes after"),
    Stage(5, "ship-to-shared-code", "Ship to shared code", "Real issue, real review"),
    Stage(6, "review-a-peer", "Review a peer", "Both sides of review"),
    Stage(7, "propose-something", "Propose something", "Then: any repo you like"),
)

STAGE_COUNT = 7
#: Stages that become a personal issue for every cohort member.
PERSONAL_STAGES = (1, 2, 3, 4, 6, 7)
#: The stage claimed from the good-shared-issue pool instead of a personal issue.
SHARED_STAGE = 5
#: Stages whose issue reads differently on each track (ADR 0010). The others are shared.
TRACK_STAGES = (1, 3, 4, 5)


def stage_by_number(n: int) -> Stage | None:
    return next((s for s in STAGES if s.number == n), None)
