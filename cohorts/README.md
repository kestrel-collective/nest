# cohorts/

One directory per cohort, holding a single `cohort.yml`. A cohort is named by its year and month (`2027-01`) or, when Kestrel opens one every two weeks, by its start date (`2027-01-12`); both forms are valid and can sit side by side.

```yaml
id: 2027-01
name: January 2027 cohort
starts: 2027-01-12
ends: 2027-04-30
members:
  - a-github-login # js track
  - handle: another-login # python track
    track: python
```

Rules:

- `id` must match the directory name.
- `members` are GitHub logins in lower case, each listed once. A plain login is on the js track; a member on the python track is written as a mapping with `handle` and `track: python` (ADR 0010). Enrolment writes the right form from the `track` it is given, and the member's stage issues open in that track's variant.
- A contributor's `profile.yml` must name a cohort that exists here, once any cohort exists.
- `defect_tier` is optional: 1 (the default), 2 or 3, the tier of planted defect this cohort's scaffolds draw from (ADR 0009). Scaffolding records each planted defect in `.defects.json` next to `cohort.yml`, a local file git ignores, so no two members get the same one while the tier has another.

Kestrel opens a cohort every two weeks. It sends a `repository_dispatch` of type `cohort`, and the Cohort workflow writes `cohorts/<id>/cohort.yml` with no members and commits it to `main` as the bot, with no pull request:

```
{ "event_type": "cohort", "client_payload": { "id": "2027-01-12", "name": "Cohort starting 12 January 2027", "starts": "2027-01-12", "ends": "2028-01-12" } }
```

By hand: `npx nest cohort-open 2027-01-12 --name "Cohort starting 12 January 2027" --starts 2027-01-12 --ends 2028-01-12 --gh`. An existing file is left as it is.

Opening a cohort is one command once the file is merged. These are maintainer commands and run on Node, whichever track the members are on; each member is scaffolded for their own track:

```bash
npx nest open-cohort 2027-01 --dry-run   # shows what would happen
npx nest open-cohort 2027-01 --gh        # scaffolds every member and opens their stage issues
```

The command is safe to run again. Anything that already exists is skipped.
