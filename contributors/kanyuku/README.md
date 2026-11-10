# contributors/kanyuku

This directory belongs to @kanyuku. Only its owner edits it; everyone else reviews. It is on the python track.

What is here and what to do with it:

- `profile.yml`: who you are. Fill it in during Stage 2. Checked on every pull request.
- `page.md`: your page, four short sections. Fill in "Where I started" during Stage 2.
- `test_profile.py`: the tests that guard your page, run by pytest. Stage 4 adds one.
- `.practice.json`: counts written by a workflow after your pull requests merge. Never edit it by hand.

Before you push: `nest validate` tells you the file, the line and the field of anything that needs changing, and `nest page-status kanyuku --local` says whether the site would build your page. You read the page itself on your pull request's Cloudflare preview, once it is public.

Your issues, in order: https://github.com/kestrel-collective/nest/issues?q=is%3Aopen+assignee%3Akanyuku+label%3Aonboarding
