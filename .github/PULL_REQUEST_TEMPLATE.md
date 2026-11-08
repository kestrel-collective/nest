## What changed

One or two sentences. If it closes a stage issue, write `Closes #123` here.

## Why

The problem this solves, in your words. For a defect: what you saw, what you expected, what you found.

## How I checked it

On the python track:

- [ ] `nest validate`
- [ ] `pytest`
- [ ] `ruff check py` (when the change touches `py/`)

On the js track:

- [ ] `npm run validate`
- [ ] `npm test`
- [ ] `npm run lint`

Paste any output a reviewer would want to see, such as a test failing before the fix and passing after.

## What it does not cover

Anything you left out on purpose, or are not sure about. An honest limit is better than a silent one.

<!-- A pull request that touches only your own directory merges on its own once CI is green. Anything else is reviewed by a maintainer. -->
