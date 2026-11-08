"""Writes py/tests/fixtures/repos/: the repositories both the Node and the Python data code are checked on."""

import json
import shutil
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
PKG = json.dumps(
    {
        "name": "fixture",
        "version": "9.9.9",
        "repository": "github:example-org/nest",
        "homepage": "https://nest.example.test",
    }
)

PAGE_OK = "## Where I started\n\nFixture text, not a real contributor.\n"


def profile(handle, page="public", **extra):
    lines = [
        f"handle: {handle}",
        extra.pop("name_line", f"name: Fixture {handle}"),
    ]
    if "cohort" in extra:
        c = extra.pop("cohort")
        if c is not None:
            lines.append(f"cohort: {c}")
    else:
        lines.append("cohort: 2027-01")
    lines.append(extra.pop("joined_line", "joined: 2027-01-12"))
    lines.append(extra.pop("intro_line", "intro: Fixture text, not a real contributor."))
    for raw in extra.pop("more", []):
        lines.append(raw)
    lines.append("visibility:")
    lines.append(f"  page: {page}")
    assert not extra, extra
    return "\n".join(lines) + "\n"


COHORT_2027_01 = """id: 2027-01
name: January 2027 cohort
starts: 2027-01-12
ends: 2027-04-30
members:
  - test-one
  - handle: test-two
    track: python
  - test-three
  - handle: test-five
    track: js
defect_tier: 2
"""

CASES = {}

# ---------------------------------------------------------------- a repository that builds
CASES["valid-site"] = {
    "cohorts/2027-01/cohort.yml": COHORT_2027_01,
    "cohorts/2027-02-08/cohort.yml": "id: 2027-02-08\nname: 'Cohort: February'\nstarts: 2027-02-08\nends: 2027-06-30\nmembers: []\n",
    "contributors/_example/profile.yml": profile("_example", "private"),
    "contributors/_example/page.md": PAGE_OK,
    "contributors/test-one/profile.yml": (
        "# A comment line\r\n"
        "handle: test-one\r\n"
        'name: "  \\u00dcn\\u00efcode \\u00d1ame  "\r\n'
        "cohort: 2027-01\r\n"
        "joined: 2027-01-12\r\n"
        "intro: >\r\n"
        "  Folded intro that runs\r\n"
        "  over two lines.\r\n"
        "skills_developing:\r\n"
        "  - debugging\r\n"
        "  - 'pytest: the basics'\r\n"
        "next: Learn to read a stack trace.\r\n"
        "visibility:\r\n"
        "  # comment inside a mapping\r\n"
        "  page: public\r\n"
        "projects:\r\n"
        "  - title: Fix a typo in the docs\r\n"
        "    repo: example-org/docs\r\n"
        "    url: https://github.com/example-org/docs/pull/1\r\n"
        "    merged: 2027-02-01\r\n"
        "  - title: \"Add a test\"\r\n"
        "    repo: example.org/tool_kit\r\n"
        "    url: https://example.test/a?b=c#d\r\n"
        "    merged: 2027-02-15\r\n"
    ),
    "contributors/test-one/page.md": (
        "## Where I started\r\n\r\nI could write a [link](https://example.test) and `code`.\r\n\r\n"
        "## What I learned\r\n\r\nLine one.\r\nLine two with **bold**.   \r\n\r\n\r\n"
        "## What I built ##\r\n\r\nThis page.\r\n"
    ),
    "contributors/test-one/.practice.json": json.dumps(
        {"updated_at": "2027-02-20T02:17:00.000Z", "practice": 3, "shared": 1, "stages_done": [1, 2, 5]},
        indent=2,
    )
    + "\n",
    "contributors/test-two/profile.yml": profile("test-two"),
    "contributors/test-two/page.md": "## Where I started\n\n\n  Indented first line.\n\n\n",
    "contributors/test-two/test_profile.py": "def test_nothing():\n    assert True\n",
    "contributors/test-three/profile.yml": profile("test-three", "private"),
    "contributors/test-three/page.md": "## Where I started\n\nReplace this paragraph.\n",
    "contributors/test-four/profile.yml": profile(
        "test-four",
        cohort=None,
        name_line="name: Fixture \U0001f985 Four",
        intro_line='intro: "Tab\\tand \\"quotes\\" and a backslash \\\\ here."',
        more=["skills_developing: [debugging, reading code]", "projects: []"],
    ),
    "contributors/test-four/page.md": "## What I am working on next\n\nThe next thing.\n\n## Where I started\n\nOut of order on purpose.\n",
    "contributors/test-four/.practice.json": '{"updated_at":"2027-03-01T00:00:00Z","practice":2.0,"shared":0,"stages_done":[3,1]}\n',
    "contributors/test-four/README.md": "# contributors/test-four\n",
    "contributors/test-five/profile.yml": profile("test-five"),
    "contributors/test-five/page.md": PAGE_OK,
    "contributors/test-five/profile.test.ts": "export {}\n",
    "contributors/test-five/test_more_checks.py": "def test_nothing():\n    assert True\n",
    "contributors/test-six/profile.yml": profile(
        "test-six",
        name_line="name: on",
        intro_line="intro: 1:20",
        more=["skills_developing: [no, off, 1_000, 2027-01-12, 0x1G]", "next: yes # a comment"],
    ),
    "contributors/test-six/page.md": "## Where I started\n\n Non-breaking space first, and a tab\tinside. \n",
}

# ---------------------------------------------------------------- YAML 1.2 values PyYAML would read as 1.1
CASES["yaml-core-schema"] = {
    "cohorts/2027-01/cohort.yml": "id: 2027-01\nname: yes\nstarts: 2027-01-12\nends: 2027-04-30\nmembers: [test-one, test-two, test-three]\n",
    "contributors/test-one/profile.yml": profile(
        "test-one",
        name_line="name: on",
        intro_line="intro: 1:20",
        more=["skills_developing: [no, off, 1_000, 2027-01-12]", "next: Null value next line is fine"],
    ),
    "contributors/test-one/page.md": PAGE_OK,
    "contributors/test-two/profile.yml": profile("test-two", name_line="name: 0o17", intro_line="intro: .inf"),
    "contributors/test-two/page.md": PAGE_OK,
    "contributors/test-three/profile.yml": profile(
        "test-three", name_line="name: True", intro_line="intro: ~", more=["next: null"]
    ),
    "contributors/test-three/page.md": PAGE_OK,
}

# ---------------------------------------------------------------- every profile problem
CASES["invalid-profile"] = {
    "cohorts/2027-01/cohort.yml": "id: 2027-01\nname: January 2027 cohort\nstarts: 2027-01-12\nends: 2027-04-30\nmembers: []\n",
    "contributors/test-one/profile.yml": (
        "handle: test-one\n"
        "nmae: Typo\n"
        "cohort: 2027-01\n"
        "joined: 2027-13-01\n"
        "intro: Fixture text.\n"
        "visibility:\n"
        "  page: open\n"
        "projects:\n"
        "  - title: ''\n"
        "    repo: bad\n"
        "    url: not a url\n"
        "    merged: yesterday\n"
        "    extra: 1\n"
    ),
    "contributors/test-one/page.md": PAGE_OK,
    "contributors/test-two/profile.yml": (
        "handle: test-two\n"
        "name: 123\n"
        "cohort: 2027-1\n"
        "joined: 2027-01-12\n"
        f"intro: {'x' * 281}\n"
        "skills_developing: debugging\n"
        "visibility: public\n"
        "projects: {}\n"
    ),
    "contributors/test-two/page.md": PAGE_OK,
    "contributors/test-three/profile.yml": profile(
        "test-three",
        name_line="name: Replace this with the name you want on your page",
        intro_line="intro: Replace this with one or two sentences.",
    ),
    "contributors/test-three/page.md": (
        "## What I learned\n\nReplace this paragraph with one thing.\n\n## What I built\n\n\n"
    ),
    "contributors/test-four/profile.yml": (
        "handle: test-4\n"
        "name: Fixture four\n"
        "cohort: 2027-01\n"
        "joined: 2027-01-12\n"
        "intro: Fixture text.\n"
        "skills_developing:\n"
        "  - Debugging\n"
        "  - pytest\n"
        "  - debugging\n"
        "  - ''\n"
        f"  - {'s' * 41}\n"
        "next: 42\n"
    ),
    "contributors/test-four/page.md": PAGE_OK,
    "contributors/test-five/profile.yml": "- handle: test-five\n- name: A list\n",
    "contributors/Test-Six/page.md": PAGE_OK,
    "contributors/test-seven/profile.yml": "handle: test-seven\nname: [unclosed\n",
    "contributors/test-seven/page.md": PAGE_OK,
    "contributors/test-seven/notes.txt": "stray\n",
    "contributors/test-eight/profile.yml": profile("test-eight", cohort="2099-01"),
    "contributors/test-eight/page.md": PAGE_OK,
    "contributors/test-nine/profile.yml": profile("test-nine", "private"),
    "contributors/test-nine/page.md": PAGE_OK,
    "contributors/test-nine/.practice.json": "{not json\n",
    "contributors/test-ten/profile.yml": profile("test-ten", "private"),
    "contributors/test-ten/page.md": PAGE_OK,
    "contributors/test-ten/.practice.json": '{"updated_at":"yesterday","practice":-1,"shared":1.5,"stages_done":[0,8],"extra":true}\n',
    "contributors/test-eleven/profile.yml": profile("test-eleven", "private"),
    "contributors/test-eleven/page.md": PAGE_OK,
    "contributors/test-eleven/.practice.json": '{"updated_at":"2027-01-01T00:00:00Z","practice":0,"shared":0,"stages_done":[1,1]}\n',
    "contributors/test-twelve/profile.yml": profile("test-twelve"),
    "contributors/test-twelve/page.md": (
        "Stray text before any heading.\n\n"
        "# Where I started\n\nOne hash.\n\n"
        "## where i started\n\nWrong case.\n\n"
        "## Hobbies\n\nNot a section.\n\n"
        "### What I built\n\nThree hashes.\n\n"
        "## What I built\n\nFirst.\n\n"
        "## What I built\n\nSecond.\n"
    ),
    "contributors/test-thirteen/profile.yml": profile("test-thirteen"),
    "contributors/test-thirteen/page.md": "",
    "contributors/test-fourteen/profile.yml": profile(
        "test-fourteen", joined_line="joined:", more=["projects:", "  - title: Only a title"]
    ),
    "contributors/test-fourteen/page.md": PAGE_OK,
    "contributors/_template/profile.yml": profile("_template", "public"),
    "contributors/_template/page.md": PAGE_OK,
}

# ---------------------------------------------------------------- every cohort problem
CASES["invalid-cohort"] = {
    "cohorts/2027-01/cohort.yml": (
        "id: 2027-01\n"
        "name: January 2027 cohort\n"
        "starts: 2027-01-12\n"
        "ends: 2027-04-30\n"
        "members:\n"
        "  - test-one\n"
        "  - _bad\n"
        "  - test-one\n"
        "  - Upper\n"
        "  - handle: test-two\n"
        "    track: ruby\n"
        "  - track: python\n"
        "  - handle: test-three\n"
        "  - handle: test-four\n"
        "    track: python\n"
        "    colour: blue\n"
        "  - 42\n"
        "  - ''\n"
        "  - [nested]\n"
        "  - handle: 7\n"
        "    track: js\n"
        "  - handle: test-one\n"
        "    track: python\n"
    ),
    "cohorts/2027-13/cohort.yml": "id: 2027-13\nname: Bad\nstarts: 2027-01-01\nends: 2027-02-01\nmembers: []\n",
    "cohorts/2027-03/README.md": "no cohort file here\n",
    "cohorts/2027-04/cohort.yml": (
        "id: 2027-05\nname: April\nstarts: 2027-04-30\nends: 2027-04-01\nmembers: []\ndefect_tier: 5\nlead: someone\n"
    ),
    "cohorts/2027-05/cohort.yml": "id: 2027-05\nname: [unclosed\n",
    "cohorts/2027-06/cohort.yml": "id: 2027-06\nname: ''\nstarts: 2027-06-31\nends: 2027-07-01\nmembers: nobody\ndefect_tier: 1.5\n",
    "cohorts/2027-07/cohort.yml": "id: 2027-07\nstarts: 2027-07-01\nends: 2027-08-01\n",
    "cohorts/2027-08/cohort.yml": "just a string\n",
}

# ---------------------------------------------------------------- nothing at all
CASES["empty"] = {"README.md": "An empty repository: no contributors, no cohorts.\n"}


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    for case, files in CASES.items():
        root = OUT / case
        root.mkdir(parents=True)
        (root / "package.json").write_text(PKG + "\n", encoding="utf-8", newline="")
        for rel, content in files.items():
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content.encode("utf-8"))
    print(f"wrote {len(CASES)} fixture repositories to {OUT}")


main()
