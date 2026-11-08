"""What the site builds: the published pages, the feed, and the data file. Mirrors site.ts and feed.ts."""

from __future__ import annotations

import datetime as _dt
from typing import Any

from .contributor import Contributor, is_publishable
from .files import stages_done
from .jsutil import dumps
from .repo import RepoResult

#: The data file the site reads (ADR 0010). Written by ``nest build-data``.
INDEX_FILE = "site/.nest/data.json"
INDEX_FORMAT = 1
#: How many pages the home page shows, most active first. Every published page is in the feed.
HOME_RECENT = 3
FEED_PATH = "/api/pages.json"


def published_contributors(result: RepoResult) -> list[Contributor]:
    """The pages the site builds. Only meaningful when the repository has no problems."""
    return [c for c in result.contributors if is_publishable(c)]


def activity(c: Contributor) -> int:
    return len(c["profile"]["projects"]) + c["practice"]["shared"]


def by_activity(contributors: list[Contributor]) -> list[Contributor]:
    """Most active first, then by handle, so the order is stable between builds."""
    return sorted(contributors, key=lambda c: (-activity(c), c["handle"]))


def page_url(site_url: str, handle: str) -> str:
    return f"{site_url.rstrip('/')}/p/{handle}/"


def build_index(result: RepoResult, release: str) -> dict[str, Any]:
    """The data file for a repository that validated. Callers refuse to build one when there are issues."""
    return {
        "format": INDEX_FORMAT,
        "release": release,
        "cohorts": list(result.cohorts),
        "contributors": [{**c, "stage": stages_done(c["practice"])} for c in published_contributors(result)],
    }


def serialize_index(index: dict[str, Any]) -> str:
    """The exact bytes of the data file: the same bytes serializeIndex writes in @nest/schema."""
    return dumps(index) + "\n"


def now_iso() -> str:
    """new Date().toISOString(): UTC, milliseconds, Z."""
    now = _dt.datetime.now(_dt.UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def build_feed(
    contributors: list[Contributor], release: str, site_url: str, generated_at: str | None = None
) -> dict:
    """The feed the landing site reads (docs/feed.md). Only publishable pages, sorted by handle."""
    pages = [
        {
            "handle": c["handle"],
            "name": c["profile"]["name"],
            "intro": c["profile"]["intro"],
            "cohort": c["profile"].get("cohort", ""),
            "stage": stages_done(c["practice"]),
            "counts": {
                "external": len(c["profile"]["projects"]),
                "shared": c["practice"]["shared"],
                "practice": c["practice"]["practice"],
            },
            "url": page_url(site_url, c["handle"]),
        }
        for c in sorted((c for c in contributors if is_publishable(c)), key=lambda c: c["handle"])
    ]
    return {"generated_at": generated_at or now_iso(), "release": release, "pages": pages}
