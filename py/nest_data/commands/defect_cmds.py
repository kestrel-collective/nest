"""``nest defect-request``, ``defect-import``, ``defect-check`` and ``defect-promote`` for both tracks."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

from .. import defect_bank as bank
from ..config import RepoConfig, UsageError


def register(sub: Any) -> None:
    r = sub.add_parser("defect-request", help="write the request file for a round of candidate defects (P2)")
    r.add_argument("--round", type=int, required=True)
    r.add_argument("--count", type=int, default=20)
    r.add_argument("--track", default="both", choices=["js", "python", "both"])
    r.add_argument("--out")
    r.set_defaults(run=run_request)
    i = sub.add_parser("defect-import", help="write the runner's acceptable outputs as candidate defects")
    i.add_argument("file")
    i.set_defaults(run=run_import)
    c = sub.add_parser("defect-check", help="run the gate on candidate defects of either track")
    c.add_argument("id", nargs="?")
    c.add_argument("--all", action="store_true")
    c.set_defaults(run=run_check)
    p = sub.add_parser("defect-promote", help="move a candidate that passed the gate into its track's bank")
    p.add_argument("id")
    p.set_defaults(run=run_promote)


def _rel(config: RepoConfig, path: Path) -> str:
    try:
        return path.resolve().relative_to(Path(config.root).resolve()).as_posix()
    except ValueError:
        return str(path)


def run_request(config: RepoConfig, args: Any, out: Any, err: Any) -> int:
    lines = bank.build_requests(config.root, args.round, args.count, args.track)
    path = Path(args.out) if args.out else bank.request_path(config.root, args.round)
    bank.write_requests(path, lines)
    tokens = bank.estimate_tokens(config.root, lines)
    tracks = sorted({line["inputs"]["slot"]["track"] for line in lines})
    out(
        f"Wrote {len(lines)} request(s) for round {args.round} ({', '.join(tracks)}) to {_rel(config, path)}."
    )
    out(
        f"Estimate: about {tokens:,} tokens (input from the characters sent, plus {len(lines)} x 2,500 output). "
        "No model was called."
    )
    prompts = sorted({line["prompt_version"] for line in lines})
    files = " and ".join(f"{bank.BANK_DIR}/{p}.md" for p in prompts)
    out(
        f"Before submitting, copy {files} to the Kestrel repository's api/app/prompts/, where the runner reads it."
    )
    return 0


def run_import(config: RepoConfig, args: Any, out: Any, err: Any) -> int:
    rows = bank.read_runner_output(Path(args.file))
    result = bank.import_candidates(config.root, rows)
    for cid in result.written:
        out(f"Candidate {cid} written to {bank.PY_CANDIDATES}/.")
    for request, problems in result.refused:
        err(f"Request {request} refused: {'; '.join(problems)}.")
    js_written = 0
    if result.js_rows:
        with tempfile.TemporaryDirectory() as d:
            js_file = Path(d) / "js.jsonl"
            js_file.write_text("\n".join(json.dumps(r) for r in result.js_rows) + "\n", encoding="utf-8")
            run = bank.run_js(config.root, "import", str(js_file))
        for line in run.stdout.splitlines():
            if line.startswith("Candidate "):
                js_written += 1
                out(line)
        for line in run.stderr.splitlines():
            err(line)
        if run.returncode != 0:
            return run.returncode
    written = len(result.written) + js_written
    refused = len(rows) - written
    out(f"Imported {written} of {len(rows)}; {refused} refused. Run nest defect-check --all next.")
    return 0


def run_check(config: RepoConfig, args: Any, out: Any, err: Any) -> int:
    if not args.all and not args.id:
        raise UsageError("defect-check needs a candidate id, or --all.")
    if args.all:
        py_ids, js_ids = bank._py_candidate_ids(config.root), bank._js_candidate_ids(config.root)
    else:
        track = bank.candidate_track(config.root, args.id)
        if track is None:
            raise UsageError(
                f"There is no candidate {args.id} in {bank.PY_CANDIDATES} or {bank.JS_CANDIDATES}."
            )
        py_ids, js_ids = ([args.id], []) if track == "python" else ([], [args.id])
    if not py_ids and not js_ids:
        out("No candidates to check.")
        return 0
    outcomes = []
    for cid in py_ids:
        o = bank.check_python_candidate(config.root, cid)
        outcomes.append(o)
        verdict = "pass" if o.passed else f"fail, {o.reason}"
        unseen = "" if o.visible else " (the rendered page does not change)"
        out(f"{cid} (python): {verdict}{unseen}")
    if py_ids:
        bank.record_checks(config.root, outcomes)
    js_failed = 0
    if js_ids:
        run = bank.run_js(config.root, "check", *(["--all"] if args.all else js_ids))
        for line in run.stdout.splitlines():
            if ": pass" in line or ": fail" in line:
                out(line.replace(":", " (js):", 1))
        for line in run.stderr.splitlines():
            err(line)
        js_failed = 0 if run.returncode == 0 else 1
    passed = sum(o.passed for o in outcomes)
    if py_ids:
        out(
            f"{passed} of {len(outcomes)} python candidate(s) passed. Results are in {bank.PY_CANDIDATES}/README.md."
        )
    if js_ids:
        out(
            f"js candidates: {'all passed' if not js_failed else 'not all passed'}. Results are in {bank.JS_CANDIDATES}/README.md."
        )
    return 0 if passed == len(outcomes) and not js_failed else 1


def run_promote(config: RepoConfig, args: Any, out: Any, err: Any) -> int:
    track = bank.candidate_track(config.root, args.id)
    if track is None:
        raise UsageError(f"There is no candidate {args.id} in {bank.PY_CANDIDATES} or {bank.JS_CANDIDATES}.")
    if track == "python":
        number, files = bank.promote_python(config.root, args.id)
        out(f"Promoted {args.id} as defect {number} on the python track.")
        for f in files:
            out(f"  {_rel(config, f)}")
        out("Run pytest, then commit the files above.")
        return 0
    run = bank.run_js(config.root, "promote", args.id, "--number", str(bank.next_number(config.root)))
    for line in run.stdout.splitlines():
        out(line)
    for line in run.stderr.splitlines():
        err(line)
    return run.returncode
