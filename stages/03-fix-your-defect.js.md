Hello {{name}}. Welcome to Stage {{stage_number}}, {{stage_title}}{{cohort_phrase}}.

## In one line

Find the one thing that was planted wrong in your page, prove it is there, say what causes it before you look, and fix it with the smallest change. About two hours, spread over a few days.

## Why this matters

Most real work is changing something that already exists without breaking it, and that starts with a defect you did not write. Two habits carry you through every codebase after this one. A fix you cannot trigger is not a fix: reproduce first, because it is the only way to know the problem is real and the only way to know later that it is gone. And debugging is reasoning, not searching: a written guess and a planned check find causes faster than reading code at random.

Your scaffold was built with exactly one defect in it, on purpose. It passes every automated check. That is the point: this one needs a person.

## Steps

1. Orient (10 minutes). Your page has only two inputs: `profile.yml` and `page.md`. Before you open either, post one line here predicting where the problem lives and why. Check-in one.
2. Reproduce (20 minutes). Open your live page at {{site}}/p/{{handle}}/ and read every line as a stranger would. Something on it is wrong, and it is not in the text you wrote in Stage 2. Post two sentences here: what the page shows, and what it should show instead. Record what you actually saw, not what you expected to see. Check-in two.
3. Say it before you look. Post one sentence on what you think causes it and one on how you will check. Check-in three. A maintainer replies with a question, not an answer. Writing the guess down before checking feels slow and is the whole skill.
4. Follow the path. Do the check you planned. `npm run validate` and `npm test` both pass, so the problem is not something they cover. Compare the line you suspect with your cohort's dates in `cohorts/{{cohort}}/cohort.yml`, with the order of sections on other pages, with your own name and handle. When the guess is wrong, write one line here on why, and make the next guess.
5. Fix it and run everything. On a branch `stage-3-{{handle}}`, make the smallest change that makes the page right; one line is a normal size. Then run `npm run validate` and `npm test`, the whole suite, not only your directory.
6. Open the pull request. Commit with a message that names the defect, for example `fix: joined date was in the wrong year`. In the description, copy your three notes: what you saw, what you expected, what you found, and one sentence on why the automated checks did not catch it. Write `Closes #` and this issue's number. It merges on its own once the checks are green.
7. Compare your route, after it merges. Post one sentence here on what you would do differently next time. Required, never scored.

## Done when

- [ ] Your three check-ins are on this issue: the prediction, what you saw and expected, the guess and the check.
- [ ] The fix merged and the live page shows the right thing.
- [ ] Your pull request says why the automated checks did not catch it. Keep that sentence: Stage 4 starts from it.

## If you get stuck

After thirty minutes of real looking, post your notes so far. You will get a narrower place to look, never the answer. Hints reveal the next step, not the cause, because the cause is the part that is yours.

<!-- Machine-readable summary read by the Kestrel platform. Keep it in step with the text above. -->

```kestrel-ticket
competency: debugging
level: guided
difficulty: starter
kp: 2
evidence_kind: practice
reserved_for: {{handle}}
stage: 3
steps:
  - title: "Predict first"
    guide: "Write where you think the defect lives before you open a file."
  - title: "Observe"
    guide: "Read your live page and record what you saw and what you expected."
  - title: "Guess and check"
    guide: "Write your guess and how you will check it before you look."
  - title: "Fix it"
    guide: "Do the check, make the smallest change, run everything and open a pull request."
  - title: "Reflect"
    guide: "After the merge, say what you would do differently next time."
acceptance_criteria:
  - "Your three check-ins are on this issue"
  - "The fix merged and the page shows the right thing"
  - "The pull request says why the checks did not catch it"
resources:
  - "{{repo_url}}/blob/main/docs/CONTRIBUTING.md"
```
