# The pages feed

`GET https://nest.kestrelcollective.org/api/pages.json`

One static JSON file, written at build time from the repository. No server, no authentication, no query parameters. The landing site at kestrelcollective.org reads it; anyone else may too.

## Shape

```json
{
  "generated_at": "2027-01-12T09:30:00.000Z",
  "release": "0.1.0",
  "pages": [
    {
      "handle": "a-github-login",
      "name": "Display Name",
      "intro": "One or two sentences from the owner.",
      "cohort": "2027-01",
      "stage": 3,
      "counts": { "external": 2, "shared": 1, "practice": 4 },
      "url": "https://nest.kestrelcollective.org/p/a-github-login/"
    }
  ]
}
```

| Field             | Meaning                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `generated_at`    | When the build ran, ISO 8601, UTC.                                               |
| `release`         | The root `package.json` version of the checkout that was built.                  |
| `pages`           | Every publishable page, sorted by handle. Empty on day one: `[]`.                |
| `handle`          | The GitHub login in lower case; also the directory name under `contributors/`.   |
| `name`, `intro`   | Exactly as the owner wrote them in `profile.yml`.                                |
| `cohort`          | Year and month, `YYYY-MM`, or a start date, `YYYY-MM-DD`.                        |
| `stage`           | Number of distinct ladder stages completed, 0 to 7.                              |
| `counts.external` | Entries in the owner's `projects` list. Listed by the owner, not verified.       |
| `counts.shared`   | Merged pull requests by the owner that touched anything outside `contributors/`. |
| `counts.practice` | Merged pull requests by the owner that touched only their own directory.         |
| `url`             | Absolute address of the page, with a trailing slash.                             |

## Rules

- Field names are a contract and are never renamed or removed. New fields may be added; readers must ignore fields they do not know.
- Only pages with `visibility.page: public`, a valid handle and a non-template directory appear. Private pages leave no trace.
- The empty feed is exactly `{ "generated_at": ..., "release": ..., "pages": [] }`.
- The same rules produce `nest feed` (from `py/`, ADR 0010) and the file the site serves, so the two never disagree: the site builds the feed from `site/.nest/data.json`, which `nest build-data` writes, and `py/tests/golden` holds both libraries to the same pages.

## Readers

The landing site fetches the feed on the server, caches it for an hour, shows the three pages with the highest `external + shared`, and falls back to an empty state when the host is unreachable or the body is not this shape. Any reader should do the same: treat a failed fetch as "no pages", never as an error page.

## Changing it

A change to the shape is an architecture decision (see `docs/adr/0005-feed-contract.md`) and consists of adding a field, never changing one.
