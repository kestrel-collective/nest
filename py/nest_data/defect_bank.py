"""The P2 defect bank for both tracks (docs/P2-defect-bank.md, ADR 0009, 0010).

A model writes candidate defects; nothing it writes reaches a newcomer unreviewed. ``nest defect-request``
writes a round of requests, ``nest defect-import`` reads the runner's output back as candidates,
``nest defect-check`` runs the gate on them, and a maintainer runs ``nest defect-promote`` on the ones that
pass.

Each candidate belongs to a track. A python candidate is a Python module defining ``DEFECT`` and a pytest
test, kept in py/nest_data/defects/candidates/, and everything about it happens here. A js candidate is a
TypeScript module and a vitest test in packages/cli/src/defects/candidates/; only Node can load and run
those, so for them these commands call the js track's code through packages/cli/dist/defect-bank/js-entry.js.
Defect numbers count up from 6 across both tracks, so a number names one defect.
"""

from __future__ import annotations

import ast
import datetime as _dt
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import UsageError
from .contributor import validate_contributor
from .defects import COMPETENCIES, DEFECTS, TIERS, Defect
from .jsutil import dumps
from .repo import validate_cohort, validate_repo
from .templates import default_plan, render_all

PROMPTS = {"js": "nest_defect_v1", "python": "nest_defect_python_v1"}
TRACK_OF_PROMPT = {v: k for k, v in PROMPTS.items()}
BANK_DIR = "tools/defect-bank"
PY_DEFECTS = "py/nest_data/defects"
PY_CANDIDATES = f"{PY_DEFECTS}/candidates"
PY_PROMOTED = f"{PY_DEFECTS}/promoted"
PY_BANK_FILE = f"{PY_DEFECTS}/bank.py"
JS_CANDIDATES = "packages/cli/src/defects/candidates"
JS_PROMOTED = "packages/cli/src/defects"
JS_ENTRY = "packages/cli/dist/defect-bank/js-entry.js"
CHECKS_FILE = "checks.json"
FIRST_NUMBER = 6
OUTPUT_TOKENS = 2_500
CHARS_PER_TOKEN = 4
EM_DASH = "\u2014"
DEFECT_ID = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\Z")

#: What each track's requests carry, read fresh so a round always sees the current code.
CONTEXT_FILES = {
    "js": {
        "adr_0004": "docs/adr/0004-planted-defects.md",
        "defects_ts": "packages/cli/src/defects.ts",
        "templates_ts": "packages/cli/src/templates.ts",
        "bank_types_ts": "packages/cli/src/defect-bank/types.ts",
        "schema_profile_ts": "packages/schema/src/profile.ts",
        "schema_page_ts": "packages/schema/src/page.ts",
        "schema_cohort_ts": "packages/schema/src/cohort.ts",
        "schema_contributor_ts": "packages/schema/src/contributor.ts",
    },
    "python": {
        "adr_0004": "docs/adr/0004-planted-defects.md",
        "defects_py": "py/nest_data/defects/__init__.py",
        "templates_py": "py/nest_data/templates.py",
        "schema_py": "py/nest_data/schema.py",
        "page_py": "py/nest_data/page.py",
        "contributor_py": "py/nest_data/contributor.py",
        "repo_py": "py/nest_data/repo.py",
    },
}
#: The fields a defect may edit: the ones the scaffold pre-fills (ADR 0004), by each track's plan names.
FIELDS = {
    "js": ["joined", "sectionOrder", "next", "name", "skills", "cohort"],
    "python": ["joined", "section_order", "next", "name", "skills", "cohort"],
}
#: Round 1 leans easy, later rounds harder, so a bank ends near eight, eight and four.
TIER_PLAN = {
    1: [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
    2: [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3],
}
COMPETENCY_CYCLE = ["debugging", "technical-communication", "debugging", "automated-testing", "debugging"]


def _read(root: Path, rel: str) -> str:
    return (Path(root) / rel).read_text(encoding="utf-8")


# ---------------------------------------------------------------- what is taken


def _py_id(path: Path) -> str:
    """A python bank file's defect id: its header says it; the module name is the id with underscores."""
    return read_header(path.read_text(encoding="utf-8"), "#").get("id") or path.stem.replace("_", "-")


def _py_modules(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(p for p in directory.glob("*.py") if not p.name.startswith(("test_", "_")))


def _py_candidate_ids(root: Path) -> list[str]:
    return sorted(_py_id(p) for p in _py_modules(Path(root) / PY_CANDIDATES))


def _js_candidate_ids(root: Path) -> list[str]:
    d = Path(root) / JS_CANDIDATES
    if not d.exists():
        return []
    return sorted(p.name[:-3] for p in d.glob("*.ts") if not p.name.endswith(".test.ts"))


def candidate_track(root: Path, defect_id: str) -> str | None:
    if defect_id in _py_candidate_ids(root):
        return "python"
    if defect_id in _js_candidate_ids(root):
        return "js"
    return None


def read_header(source: str, comment: str) -> dict[str, str]:
    """The ``<comment> key: value`` provenance lines at the top of a bank file."""
    out: dict[str, str] = {}
    pattern = re.compile(rf"^{re.escape(comment)} ([a-z_]+): (.*)$")
    for line in source.splitlines():
        if not line.startswith(comment):
            break
        m = pattern.match(line)
        if m:
            out[m.group(1)] = m.group(2)
    return out


def promoted_numbers(root: Path) -> dict[str, int]:
    """Every promoted defect's number, on both tracks, read from the headers of the promoted files."""
    out: dict[str, int] = {}
    for p in _py_modules(Path(root) / PY_PROMOTED):
        n = read_header(p.read_text(encoding="utf-8"), "#").get("number")
        if n and n.isdigit():
            out[_py_id(p)] = int(n)
    for p in sorted((Path(root) / JS_PROMOTED).glob("*.ts")):
        if p.name.endswith(".test.ts") or p.name == "bank.ts":
            continue
        n = read_header(p.read_text(encoding="utf-8"), "//").get("number")
        if n and n.isdigit():
            out[p.name[:-3]] = int(n)
    return out


def existing_ids(root: Path) -> list[str]:
    """Ids already taken on either track: the five, promoted defects and every candidate waiting for review."""
    ids = {d.id for d in DEFECTS} | set(promoted_numbers(root))
    ids |= set(_py_candidate_ids(root)) | set(_js_candidate_ids(root))
    return sorted(ids)


# ---------------------------------------------------------------- requests


@dataclass
class Slot:
    round: int
    index: int
    tier: int
    competency: str
    field: str
    track: str


def slots(round_: int, count: int = 20, track: str = "both") -> list[Slot]:
    """One round's slots. With both tracks, they alternate js and python."""
    tiers = TIER_PLAN.get(round_, TIER_PLAN[2])
    out = []
    for i in range(count):
        t = ("js", "python")[i % 2] if track == "both" else track
        fields = FIELDS[t]
        out.append(
            Slot(
                round=round_,
                index=i + 1,
                tier=tiers[i % len(tiers)],
                competency=COMPETENCY_CYCLE[(i + round_ - 1) % len(COMPETENCY_CYCLE)],
                field=fields[(i + round_ - 1) % len(fields)],
                track=t,
            )
        )
    return out


def build_requests(root: Path, round_: int, count: int = 20, track: str = "both") -> list[dict[str, Any]]:
    if round_ < 1:
        raise UsageError("The round is a whole number from 1.")
    if track not in ("js", "python", "both"):
        raise UsageError(f'--track must be js, python or both, not "{track}".')
    context: dict[str, dict[str, str]] = {}
    for t, files in CONTEXT_FILES.items():
        context[t] = {}
        for key, rel in files.items():
            if not (Path(root) / rel).exists():
                raise UsageError(f"{rel} is missing, so the request cannot carry it.")
            context[t][key] = _read(root, rel)
    taken = existing_ids(root)
    return [
        {
            "id": f"r{round_}-{s.index:02d}",
            "prompt_version": PROMPTS[s.track],
            "inputs": {"slot": s.__dict__, "existing_ids": taken, "context": context[s.track]},
        }
        for s in slots(round_, count, track)
    ]


def estimate_tokens(root: Path, lines: list[dict[str, Any]]) -> int:
    """Input tokens from the characters sent (prompt included), plus the expected output."""
    prompts = {v: _read(root, f"{BANK_DIR}/{v}.md") for v in {line["prompt_version"] for line in lines}}
    return sum(
        (len(prompts[line["prompt_version"]]) + len(json.dumps(line["inputs"], indent=1, ensure_ascii=False)))
        // CHARS_PER_TOKEN
        + 1
        + OUTPUT_TOKENS
        for line in lines
    )


def request_path(root: Path, round_: int) -> Path:
    return Path(root) / BANK_DIR / "requests" / f"round-{round_}.jsonl"


def write_requests(path: Path, lines: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "\n".join(json.dumps(line, ensure_ascii=False, separators=(",", ":")) for line in lines) + "\n"
    path.write_bytes(text.encode("utf-8"))


# ---------------------------------------------------------------- the runner's output


def read_runner_output(path: Path) -> list[dict[str, Any]]:
    """Reads the runner's output JSONL, line by line, and says which line is wrong."""
    if not Path(path).exists():
        raise UsageError(f"{path} does not exist.")
    rows = []
    for i, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines()):
        if not raw.strip():
            continue
        try:
            obj = json.loads(raw)
        except ValueError:
            raise UsageError(f"Line {i + 1} of {path} is not JSON.") from None
        if not all(isinstance(obj.get(k), str) for k in ("id", "model", "prompt_version")):
            raise UsageError(f"Line {i + 1} of {path} needs id, model and prompt_version.")
        rows.append(obj)
    return rows


ALLOWED_MODULE_IMPORTS = ("nest_data", "__future__")
ALLOWED_TEST_IMPORTS = ("nest_data", "os", "pytest")
FORBIDDEN_NAMES = {
    "eval",
    "exec",
    "compile",
    "open",
    "__import__",
    "globals",
    "locals",
    "breakpoint",
    "input",
}
FORBIDDEN_MODULES = (
    "subprocess",
    "socket",
    "urllib",
    "http",
    "random",
    "shutil",
    "importlib",
    "sys",
    "datetime",
)


def _code_problems(source: str, what: str, allowed: tuple[str, ...]) -> list[str]:
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return [f"the {what} is not valid Python ({e.msg}, line {e.lineno})"]
    problems = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names = [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            names = [node.module or ""]
        else:
            names = []
        for name in names:
            top = name.split(".")[0]
            if top not in allowed or top in FORBIDDEN_MODULES:
                problems.append(f"the {what} imports {name}")
        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            problems.append(f"the {what} uses {node.id}")
        if isinstance(node, ast.Attribute) and node.attr in ("system", "popen", "remove", "unlink", "rmtree"):
            problems.append(f"the {what} calls {node.attr}")
    return sorted(set(problems))


def parse_python_candidate(text: str | None, taken: set[str]) -> tuple[dict[str, Any] | None, list[str]]:
    """Parses and checks one python output. Returns the candidate, or the reasons it was refused."""
    raw = (text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    try:
        obj = json.loads(raw)
    except ValueError:
        return None, ["the output is not JSON"]
    if not isinstance(obj, dict):
        return None, ["the output is not a JSON object"]

    def s(k: str) -> str:
        return obj[k] if isinstance(obj.get(k), str) else ""

    problems = []
    did = s("id")
    if not (DEFECT_ID.match(did) and 3 <= len(did) <= 40):
        problems.append(f'id "{did}" is not lower case words joined by hyphens, 3 to 40 characters')
    elif did in taken:
        problems.append(f'id "{did}" is already taken')
    if obj.get("tier") not in TIERS or isinstance(obj.get("tier"), bool):
        problems.append("tier must be 1, 2 or 3")
    if obj.get("competency") not in COMPETENCIES:
        problems.append(f"competency must be one of {', '.join(COMPETENCIES)}")
    if not s("symptom") or len(s("symptom")) > 200:
        problems.append("symptom must be one sentence")
    if not isinstance(obj.get("needs_cohort"), bool):
        problems.append("needs_cohort must be true or false")
    module, test = s("module"), s("test")
    if "DEFECT = Defect(" not in module:
        problems.append("the module does not define DEFECT = Defect(...)")
    if did and f'"{did}"' not in module and f"'{did}'" not in module:
        problems.append("the module does not use its id")
    if "NEST_DEFECT_ROOT" not in test or "skipif" not in test:
        problems.append("the test does not follow the shape in the prompt (NEST_DEFECT_ROOT, skipif)")
    if did and re.search(rf"import[^\n]*{re.escape(did.replace('-', '_'))}", test):
        problems.append("the test imports the defect")
    problems += _code_problems(module, "module", ALLOWED_MODULE_IMPORTS)
    problems += _code_problems(test, "test", ALLOWED_TEST_IMPORTS)
    if problems:
        return None, problems
    return {**obj, "id": did, "module": module, "test": test, "notes": s("notes")}, []


def header(provenance: dict[str, Any], extra: dict[str, str] | None = None) -> str:
    """The provenance every python bank file carries (D-39 in Kestrel), as comment lines."""
    lines = {
        "model": provenance.get("model", "unknown"),
        "prompt_version": provenance.get("prompt_version", "unknown"),
        "generated_at": provenance.get("generated_at") or "unknown",
        "request": provenance.get("request", "unknown"),
        **(extra or {}),
    }
    return "\n".join(
        [
            "# A planted defect from the P2 bank (docs/P2-defect-bank.md, ADR 0009, 0010).",
            *[f"# {k}: {v}" for k, v in lines.items()],
            "",
        ]
    )


def _module_name(defect_id: str) -> str:
    return defect_id.replace("-", "_")


def _py_files(root: Path, defect_id: str, where: str = PY_CANDIDATES) -> tuple[Path, Path]:
    d = Path(root) / where
    return d / f"{_module_name(defect_id)}.py", d / f"test_{_module_name(defect_id)}.py"


def _no_dashes(text: str) -> str:
    return text.replace(EM_DASH, ", ")


@dataclass
class ImportResult:
    written: list[str] = field(default_factory=list)
    refused: list[tuple[str, list[str]]] = field(default_factory=list)
    js_rows: list[dict[str, Any]] = field(default_factory=list)


def import_candidates(root: Path, rows: list[dict[str, Any]]) -> ImportResult:
    """Writes every acceptable python output as a candidate, and hands back the js track's rows."""
    result = ImportResult()
    taken = set(existing_ids(root))
    (Path(root) / PY_CANDIDATES).mkdir(parents=True, exist_ok=True)
    for row in rows:
        track = TRACK_OF_PROMPT.get(row["prompt_version"])
        if track == "js":
            result.js_rows.append(row)
            continue
        if track is None:
            result.refused.append(
                (row["id"], [f"prompt version {row['prompt_version']} belongs to no track"])
            )
            continue
        if row.get("ok") is False:
            result.refused.append(
                (row["id"], [f"the request failed: {row.get('error') or 'no reason given'}"])
            )
            continue
        candidate, problems = parse_python_candidate(row.get("output"), taken)
        if candidate is None:
            result.refused.append((row["id"], problems))
            continue
        notes = re.sub(r"\s+", " ", _no_dashes(candidate["notes"]))[:300]
        head = header(
            {
                "model": row["model"],
                "prompt_version": row["prompt_version"],
                "generated_at": row.get("generated_at"),
                "request": row["id"],
            },
            {"status": "candidate", "id": candidate["id"], "notes": notes},
        )
        module_path, test_path = _py_files(root, candidate["id"])
        module_path.write_bytes((head + _no_dashes(candidate["module"]).strip() + "\n").encode("utf-8"))
        test_path.write_bytes((head + _no_dashes(candidate["test"]).strip() + "\n").encode("utf-8"))
        taken.add(candidate["id"])
        result.written.append(candidate["id"])
    write_readme(root)
    return result


# ---------------------------------------------------------------- the gate

HANDLE = "defect-check"
COHORT = "2027-01"
COHORT_YML = (
    f"id: {COHORT}\nname: January 2027 cohort\nstarts: 2027-01-12\nends: 2027-04-30\nmembers:\n  - {HANDLE}\n"
)


def load_defect(path: Path) -> Defect:
    """Loads a candidate module from its file and returns its DEFECT. Raises on anything else."""
    spec = importlib.util.spec_from_file_location(f"nest_candidate_{path.stem}", path)
    if spec is None or spec.loader is None:
        raise ValueError("the module cannot be loaded")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    defect = getattr(mod, "DEFECT", None)
    if not isinstance(defect, Defect):
        raise ValueError("the module has no DEFECT of the bank's Defect type")
    return defect


def page_view(c: dict[str, Any]) -> Any:
    """What the live page shows of a contributor (site/src/pages/p/[handle]/index.astro)."""
    p = c["profile"]
    return [
        c["handle"],
        p["name"],
        p["intro"],
        p.get("cohort"),
        p["joined"],
        p["skills_developing"],
        p.get("next"),
        p["projects"],
        [[s["title"], s["body"]] for s in c["page"]["sections"]],
    ]


def _scratch_repo(defect: Defect | None) -> Path:
    root = Path(tempfile.mkdtemp(prefix="nest-gate-"))
    (root / "package.json").write_text(
        json.dumps({"name": "gate", "version": "0.1.0", "repository": "github:example-org/nest"}),
        encoding="utf-8",
    )
    (root / "cohorts" / COHORT).mkdir(parents=True)
    (root / "cohorts" / COHORT / "cohort.yml").write_text(COHORT_YML, encoding="utf-8")
    plan = default_plan(HANDLE, COHORT, "2027-01-12")
    if defect is not None:
        defect.apply(plan)
    d = root / "contributors" / HANDLE
    d.mkdir(parents=True)
    for name, text in render_all(plan, "https://github.com/example-org/nest").items():
        (d / name).write_bytes(text.encode("utf-8"))
    return root


@dataclass
class TestRun:
    ran: int
    failed: int
    error: str | None = None


def run_test(test_file: Path, scaffold_root: Path) -> TestRun:
    """Runs one candidate test with pytest against a scaffold, outside the repository's own configuration."""
    work = Path(tempfile.mkdtemp(prefix="nest-gate-test-"))
    try:
        report = work / "report.xml"
        (work / "pytest.ini").write_text("[pytest]\n", encoding="utf-8")
        env = {
            **os.environ,
            "NEST_DEFECT_ROOT": str(scaffold_root),
            "NEST_DEFECT_HANDLE": HANDLE,
            "PYTHONPATH": os.pathsep.join(p for p in sys.path if p),
        }
        run = subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                str(test_file),
                "-q",
                "-p",
                "no:cacheprovider",
                "-c",
                str(work / "pytest.ini"),
                "--rootdir",
                str(work),
                "--import-mode=importlib",
                f"--junitxml={report}",
            ],
            cwd=work,
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if not report.exists():
            first = (run.stderr or run.stdout or "pytest did not run").strip().splitlines()
            return TestRun(0, 0, first[0] if first else "pytest did not run")
        suite = ET.parse(report).getroot()
        suite = suite if suite.tag == "testsuite" else suite.find("testsuite")
        if suite is None:
            return TestRun(0, 0, "pytest wrote no results")
        tests, skipped = int(suite.get("tests", 0)), int(suite.get("skipped", 0))
        failures, errors = int(suite.get("failures", 0)), int(suite.get("errors", 0))
        message = None
        if errors and tests - skipped == errors:
            err = suite.find(".//error")
            message = (err.get("message") if err is not None else None) or "the test does not load"
        return TestRun(tests - skipped, failures + errors, message)
    finally:
        shutil.rmtree(work, ignore_errors=True)


@dataclass
class CheckOutcome:
    id: str
    track: str
    passed: bool
    reason: str = ""
    visible: bool = False


def check_python_candidate(root: Path, defect_id: str) -> CheckOutcome:
    """The gate a python candidate must pass before a maintainer may promote it (ADR 0004, 0009)."""

    def fail(reason: str, visible: bool = False) -> CheckOutcome:
        return CheckOutcome(defect_id, "python", False, reason, visible)

    module_path, test_path = _py_files(root, defect_id)
    if not module_path.exists():
        return fail(f"no candidate {defect_id} in {PY_CANDIDATES}")
    if not test_path.exists():
        return fail("the test file is missing")
    try:
        defect = load_defect(module_path)
    except Exception as e:  # the candidate's own code: any failure is a reason, not a crash
        return fail(f"the module does not load: {str(e).splitlines()[0] if str(e) else type(e).__name__}")
    if defect.id != defect_id:
        return fail(f'the module\'s id is "{defect.id}", not "{defect_id}"')
    if defect.tier not in TIERS:
        return fail("tier must be 1, 2 or 3")
    if defect.competency not in COMPETENCIES:
        return fail("the competency is not a rubric slug")
    if not callable(defect.apply) or not callable(defect.detect):
        return fail("apply and detect must be functions")
    roots: list[Path] = []
    try:
        try:
            with_root = _scratch_repo(defect)
        except Exception as e:
            return fail(f"apply raises: {e}")
        clean_root = _scratch_repo(None)
        roots += [with_root, clean_root]
        repo = validate_repo(with_root)
        if repo.issues:
            i = repo.issues[0]
            return fail(f"nest validate fails: {i.file} {i.field} {i.message}")
        cohort, _ = validate_cohort(with_root, COHORT)
        with_c, _ = validate_contributor(with_root, HANDLE)
        clean_c, _ = validate_contributor(clean_root, HANDLE)
        visible = dumps(page_view(with_c)) != dumps(page_view(clean_c))
        try:
            found = defect.detect(with_c, cohort)
            clean_found = defect.detect(clean_c, cohort)
        except Exception as e:
            return fail(f"detect raises: {e}", visible)
        if not found:
            return fail("the detector returns None with the defect planted", visible)
        if clean_found:
            return fail(f'the detector fires on a clean scaffold: "{clean_found}"', visible)
        red = run_test(test_path, with_root)
        if red.error and red.ran == red.failed:
            return fail(f"the test does not run: {red.error}", visible)
        if red.ran == 0:
            return fail("the test file has no test that runs", visible)
        if red.failed == 0:
            return fail("the test passes with the defect planted", visible)
        green = run_test(test_path, clean_root)
        if green.ran == 0 or green.failed > 0:
            return fail("the test fails without the defect", visible)
        return CheckOutcome(defect_id, "python", True, "", visible)
    finally:
        for r in roots:
            shutil.rmtree(r, ignore_errors=True)


def read_checks(root: Path) -> dict[str, dict[str, Any]]:
    path = Path(root) / PY_CANDIDATES / CHECKS_FILE
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def record_checks(root: Path, outcomes: list[CheckOutcome], now: _dt.datetime | None = None) -> None:
    """Records python outcomes in candidates/checks.json and the README table."""
    checks = read_checks(root)
    at = (now or _dt.datetime.now(_dt.UTC)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    for o in outcomes:
        checks[o.id] = {
            "result": "pass" if o.passed else "fail",
            "reason": o.reason,
            "visible": o.visible,
            "checked_at": at,
        }
    for cid in list(checks):
        if cid not in _py_candidate_ids(root):
            del checks[cid]
    d = Path(root) / PY_CANDIDATES
    d.mkdir(parents=True, exist_ok=True)
    (d / CHECKS_FILE).write_bytes((dumps(checks) + "\n").encode("utf-8"))
    write_readme(root)


def _field(source: str, key: str) -> str:
    m = re.search(rf"\b{key}\s*=\s*(?:\"((?:\\.|[^\"\\])*)\"|'((?:\\.|[^'\\])*)'|(\d+))", source)
    return (m.group(1) or m.group(2) or m.group(3) or "") if m else ""


def write_readme(root: Path) -> None:
    """candidates/README.md: one row per python candidate, with the gate's last result."""
    d = Path(root) / PY_CANDIDATES
    d.mkdir(parents=True, exist_ok=True)
    checks = read_checks(root)
    rows = []
    for p in _py_modules(d):
        src = p.read_text(encoding="utf-8")
        head = read_header(src, "#")
        cid = _py_id(p)
        check = checks.get(cid)
        status = (
            f"{check['result']}{': ' + check['reason'] if check['reason'] else ''}"
            if check
            else head.get("status", "candidate")
        )
        symptom = _field(src, "symptom").replace("|", "/")
        rows.append(
            f"| {cid} | {_field(src, 'tier')} | {_field(src, 'competency')} | {symptom} | {status.replace('|', '/')} |"
        )
    text = "\n".join(
        [
            "# Python candidate defects",
            "",
            "Written by `nest defect-import` from the model output of a P2 round, for candidates whose track is python "
            "(docs/P2-defect-bank.md). Nothing here is in the bank: `nest defect-check` runs the gate and fills the "
            "status, and a maintainer promotes the ones that pass with `nest defect-promote <id>`.",
            "",
            "A candidate is two files: `<id>.py`, which defines `DEFECT`, and `test_<id>.py`, the Stage 4 test a "
            "newcomer could write. The test runs only when the gate points it at a scaffold (`NEST_DEFECT_ROOT`), so "
            "a plain `pytest` skips it.",
            "",
            "| id  | tier | competency | symptom | gate |",
            "| --- | ---- | ---------- | ------- | ---- |",
            *(rows or ["| (none yet) | | | | |"]),
            "",
        ]
    )
    (d / "README.md").write_bytes(text.encode("utf-8"))


# ---------------------------------------------------------------- promotion


def next_number(root: Path) -> int:
    """The next defect number, counted across both tracks so a number names one defect."""
    return max([FIRST_NUMBER - 1, *promoted_numbers(root).values()]) + 1


def _git_user(root: Path) -> str:
    r = subprocess.run(["git", "config", "user.name"], cwd=root, capture_output=True, text=True, check=False)
    return r.stdout.strip() or "unknown"


def write_bank(root: Path) -> Path:
    """bank.py: the promoted python defects in number order."""
    entries = []
    for p in _py_modules(Path(root) / PY_PROMOTED):
        n = read_header(p.read_text(encoding="utf-8"), "#").get("number")
        if n and n.isdigit():
            entries.append((int(n), p.stem))
    entries.sort()
    path = Path(root) / PY_BANK_FILE
    listing = (
        ["PROMOTED: list[tuple[int, str]] = ["] + [f'    ({n}, "{m}"),' for n, m in entries] + ["]"]
        if entries
        else ["PROMOTED: list[tuple[int, str]] = []"]
    )
    body = "\n".join(
        [
            '"""Written by ``nest defect-promote`` (docs/P2-defect-bank.md, ADR 0009, 0010). Do not edit by hand.',
            "",
            "Python defects promoted from candidates, as (number, module name in promoted/). The first five live in",
            "__init__.py and exist on both tracks.",
            '"""',
            "",
            *listing,
            "",
        ]
    )
    path.write_bytes(body.encode("utf-8"))
    return path


def promote_python(
    root: Path, defect_id: str, by: str | None = None, at: _dt.datetime | None = None
) -> tuple[int, list[Path]]:
    module_path, test_path = _py_files(root, defect_id)
    if not module_path.exists():
        raise UsageError(f"There is no candidate {defect_id} in {PY_CANDIDATES}.")
    check = read_checks(root).get(defect_id)
    if not check or check["result"] != "pass":
        why = f" ({check['reason']})" if check else ""
        raise UsageError(
            f"{defect_id} has not passed the gate{why}. Run nest defect-check {defect_id} first."
        )
    number = next_number(root)
    who = by or _git_user(root)
    when = (at or _dt.datetime.now(_dt.UTC)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    to = Path(root) / PY_PROMOTED
    to.mkdir(parents=True, exist_ok=True)
    files = []
    for src in (module_path, test_path):
        if not src.exists():
            continue
        text = src.read_text(encoding="utf-8")
        head = read_header(text, "#")
        lines = text.splitlines()
        while lines and lines[0].startswith("#"):
            lines.pop(0)
        body = "\n".join(lines)
        stamp = header(
            {k: head.get(k) for k in ("model", "prompt_version", "generated_at", "request")},
            {
                "status": "promoted",
                "id": defect_id,
                "number": str(number),
                "promoted_by": who,
                "promoted_at": when,
                **({"notes": head["notes"]} if head.get("notes") else {}),
            },
        )
        dest = to / src.name
        dest.write_bytes((stamp + body.lstrip() + "\n").encode("utf-8"))
        src.unlink()
        files.append(dest)
    checks = read_checks(root)
    checks.pop(defect_id, None)
    (Path(root) / PY_CANDIDATES / CHECKS_FILE).write_bytes((dumps(checks) + "\n").encode("utf-8"))
    write_readme(root)
    files.append(write_bank(root))
    return number, files


# ---------------------------------------------------------------- the js track, through Node


def run_js(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    """Runs the js track's defect-bank code (packages/cli, built with npx tsc -b) for a js candidate."""
    entry = Path(root) / JS_ENTRY
    if not entry.exists():
        raise UsageError(
            f"{JS_ENTRY} is missing. js candidates need the js track's code: run npm ci and npx tsc -b."
        )
    node = shutil.which("node")
    if node is None:
        raise UsageError(
            "js candidates need Node, which is not on PATH. Install Node 20 or run this on the js track."
        )
    return subprocess.run([node, str(entry), *args], cwd=root, capture_output=True, text=True, check=False)
