"""Handles and cohort ids. Mirrors packages/schema/src/handle.ts.

A contributor handle is the GitHub login, written in lower case: letters, digits and single hyphens, 1 to 39
characters, no leading or trailing hyphen. A leading underscore is rejected on purpose: template directories
such as contributors/_example/ are named with one so that they can never publish a page.
"""

from __future__ import annotations

import datetime as _dt
import re

from .jsutil import length

HANDLE_PATTERN = re.compile(r"^[a-z0-9](?:-?[a-z0-9]){0,38}\Z")
HANDLE_MAX_LENGTH = 39
#: A year and a month (2027-01), or the cohort's start date (2027-01-12).
COHORT_ID_PATTERN = re.compile(r"^[0-9]{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?\Z")


def is_handle(value: str) -> bool:
    return length(value) <= HANDLE_MAX_LENGTH and HANDLE_PATTERN.match(value) is not None


def is_cohort_id(value: str) -> bool:
    if not COHORT_ID_PATTERN.match(value):
        return False
    if len(value) == 7:
        return True
    try:  # a start date must be a real day: 2027-02-30 is not
        _dt.date.fromisoformat(value)
    except ValueError:
        return False
    return True


def is_template_dir(name: str) -> bool:
    return name.startswith("_")


def explain_handle(value: str) -> str | None:
    """Why a value is not a valid handle, in one plain sentence, or None when it is valid."""
    if length(value) == 0:
        return "must not be empty."
    if value.startswith("_"):
        return "must not start with an underscore. Directories that start with one are templates and never publish."
    if value != value.lower():
        return "must be in lower case."
    if length(value) > HANDLE_MAX_LENGTH:
        return f"must be at most {HANDLE_MAX_LENGTH} characters."
    if value.startswith("-") or value.endswith("-"):
        return "must not start or end with a hyphen."
    if "--" in value:
        return "must not contain two hyphens in a row."
    if not re.fullmatch(r"[a-z0-9-]+", value, re.ASCII):
        return "may only contain lower-case letters, digits and hyphens."
    if not HANDLE_PATTERN.match(value):
        return "is not a valid handle."
    return None
