# contributors/

One directory per contributor, named after their GitHub login in lower case. Each directory is owned by one person: only its owner edits it, everyone else reviews.

What a directory holds:

- `profile.yml`: who you are. Checked on every pull request by `nest validate` (python track) or `npm run validate` (js track); both give the same answer.
- `page.md`: your page. Four short sections under fixed headings.
- The tests that guard your page, in your track's language: `test_profile.py`, run by pytest, on the python track, or `profile.test.ts`, run by vitest, on the js track. The scaffold ships one test; Stage 4 adds another.
- `.practice.json`: counts written by a workflow after merges. Never edit it by hand.
- `README.md`: optional.

Nothing else belongs here. Pictures, drafts and notes live elsewhere.

`_example/` shows what a new js-track directory looks like. A python-track directory has the same files, with `test_profile.py` in place of `profile.test.ts` and python commands in its `README.md`. `_example/` is private, never published, and regenerated with `npx nest scaffold _example --template --cohort 2027-01` when the template changes. Do not edit it by hand.

Your page is published only when `visibility.page` in your `profile.yml` says `public`. You can set it back to `private` with one pull request at any time.
