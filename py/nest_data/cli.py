"""The ``nest`` command of the python track: the data step for CI and the Cloudflare build (ADR 0010).

Every command finds the repository from the current directory, or takes ``--root``. Output goes to stdout,
problems to stderr. Exit codes: 0 done, 1 problems found, 2 the command was called wrongly.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from . import __version__
from .config import RepoConfig, UsageError, find_root, read_config
from .issues import ValidationIssue, format_issue
from .jsutil import dumps
from .page_status import run_page_status
from .repo import validate_repo
from .site import INDEX_FILE, build_feed, build_index, serialize_index

Out = Callable[[str], None]


def sort_issues(issues: Sequence[ValidationIssue]) -> list[ValidationIssue]:
    """By file in plain character order, then by line, with problems that have no line last."""
    inf = float("inf")
    return sorted(issues, key=lambda i: (i.file.encode("utf-16-be"), inf if i.line is None else i.line))


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


def run_validate(config: RepoConfig, out: Out, err: Out) -> int:
    """Prints every problem as file:line field: sentence. Exit code 1 when there are any."""
    from .files import list_cohort_ids, list_contributor_dirs

    result = validate_repo(config.root)
    for issue in sort_issues(result.issues):
        err(format_issue(issue))
    dirs = list_contributor_dirs(config.root)
    templates = sum(1 for d in dirs if d.startswith("_"))
    cohorts = len(list_cohort_ids(config.root))
    people = len(dirs) - templates
    what = (
        f"{people} contributor director{_plural(people, 'y', 'ies')}, "
        f"{templates} template{_plural(templates, '', 's')} and {cohorts} cohort{_plural(cohorts, '', 's')}"
    )
    if not result.issues:
        out(f"Checked {what}: no problems.")
        return 0
    n = len(result.issues)
    err(f"{n} problem{_plural(n, '', 's')} found in {what}.")
    return 1


def run_build_data(config: RepoConfig, out_path: str | None, out: Out, err: Out) -> int:
    """Validates, then writes the data file the site reads. Writes nothing when there are problems."""
    result = validate_repo(config.root)
    if result.issues:
        for issue in sort_issues(result.issues):
            err(format_issue(issue))
        err("The site data was not written because the repository has problems. Fix them first.")
        return 1
    index = build_index(result, config.version)
    target = Path(config.root) / (out_path or INDEX_FILE)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(serialize_index(index).encode("utf-8"))
    pages = len(index["contributors"])
    shown = (out_path or INDEX_FILE).replace("\\", "/")
    out(
        f"Wrote {shown}: {pages} published page{_plural(pages, '', 's')}, "
        f"{len(index['cohorts'])} cohort{_plural(len(index['cohorts']), '', 's')}."
    )
    return 0


def run_feed(config: RepoConfig, out_path: str | None, out: Out, err: Out) -> int:
    """Prints the feed, or writes it with --out. Refuses to build a feed from a repository with problems."""
    result = validate_repo(config.root)
    if result.issues:
        for issue in result.issues:
            err(format_issue(issue))
        err("The feed was not generated because the repository has problems. Fix them first.")
        return 1
    feed = build_feed(result.contributors, config.version, config.site_url)
    text = dumps(feed) + "\n"
    if out_path:
        target = (Path(config.root) / out_path).resolve()
        target.write_bytes(text.encode("utf-8"))
        n = len(feed["pages"])
        out(f"Wrote {n} page{_plural(n, '', 's')} to {target}")
    else:
        out(text.rstrip("\n"))
    return 0


ROOT_HELP = "the repository root; found from the current directory when left out"


class _Commands(argparse._SubParsersAction):  # type: ignore[type-arg]
    """Every command accepts --root after its name too, as the Node CLI does."""

    def add_parser(self, name: str, **kwargs):  # type: ignore[no-untyped-def,override]
        parser = super().add_parser(name, **kwargs)
        parser.add_argument("--root", default=argparse.SUPPRESS, help=ROOT_HELP)
        return parser


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="nest", description="Nest's data step (python track).")
    p.add_argument("--version", action="version", version=f"nest_data {__version__}")
    p.add_argument("--root", help=ROOT_HELP)
    p.register("action", "parsers", _Commands)
    sub = p.add_subparsers(dest="command", metavar="<command>")
    sub.add_parser("validate", help="check every contributor and cohort directory")
    b = sub.add_parser("build-data", help=f"validate, then write {INDEX_FILE} for the site")
    b.add_argument("--out", help=f"where to write the data file (default {INDEX_FILE})")
    s = sub.add_parser(
        "page-status", help="whether the site would build a person's page from main, and why not"
    )
    s.add_argument("handle")
    s.add_argument("--ref", help="a git ref to read instead of origin/main")
    s.add_argument("--local", action="store_true", help="read the working tree instead of a git ref")
    f = sub.add_parser("feed", help="print the pages feed, or write it to a file")
    f.add_argument("--out")
    from .commands import register

    register(sub)
    return p


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if args.command is None:
        parser.print_help()
        return 0
    out: Out = lambda line: print(line, flush=True)  # noqa: E731
    err: Out = lambda line: print(line, file=sys.stderr, flush=True)  # noqa: E731
    try:
        config = read_config(Path(args.root) if args.root else find_root())
        if args.command == "validate":
            return run_validate(config, out, err)
        if args.command == "build-data":
            return run_build_data(config, args.out, out, err)
        if args.command == "page-status":
            return run_page_status(config, args.handle, out, err, ref=args.ref, local=args.local)
        if args.command == "feed":
            return run_feed(config, args.out, out, err)
        return args.run(config, args, out, err)
    except UsageError as e:
        err(str(e))
        return 2


def entry() -> None:  # pragma: no cover - the console script
    sys.exit(main())
