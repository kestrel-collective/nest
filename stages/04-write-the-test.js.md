Hello {{name}}. Welcome to Stage {{stage_number}}, {{stage_title}}{{cohort_phrase}}.

## In one line

Turn the sentence you kept from Stage 3 into a test that fails while the defect is there and passes once it is gone. About an hour.

## Why this matters

A test is a claim about behaviour that the machine checks for you. A test that fails before the fix and passes after it is the proof that your Stage 3 guess was right, and it stops the defect coming back. Coverage is a number; a well-chosen assertion is a decision.

## Before you start

- [ ] Your Stage 3 fix has merged, and you have the sentence that says why the checks did not catch it.
- [ ] `git switch main` and `git pull`.

## Steps

1. Open `contributors/{{handle}}/profile.test.ts`. One test is already there: it loads your directory with `validateContributor(root, handle)` and checks for no problems. Your test goes after it and starts from the same shape; copying the shape of an existing test is how everyone writes their first one.
2. Decide what to assert, in words first. Post one sentence here: "the test checks that ...". Check-in. For example: the joined date is not before the cohort starts, or the sections are in the expected order. `result.contributor.profile` and `result.contributor.page.sections` hold your data; `validateCohort(root, '{{cohort}}')` gives the cohort dates if you need them.
3. Make it fail first. On a branch `stage-4-{{handle}}`, write the test, then put the Stage 3 defect back for a moment (one line in `profile.yml` or `page.md`) and run:

   ```bash
   npx vitest run contributors/{{handle}}
   ```

   Your new test must be the one that fails. If everything passes, the test is not testing the defect yet. If a different test fails, read which one and why: a test that is wrong looks different from code that is wrong.

4. Remove the defect again and run the same command. Everything passes. Keep both outputs.
5. Commit the test alone, not the defect: `git commit -am "test: guard against <the defect> on my page"`.
6. Open the pull request. Paste the failing output and the passing output in the description, and one sentence on what this test guards and what it does not. `Closes #` and this issue's number. It merges on its own once the checks are green.

## Done when

- [ ] Your test fails with the defect present and passes without it, and the pull request shows both.
- [ ] The test is merged and runs in CI for every future change to your directory.
- [ ] You can say what the test guards and what it does not.

## If you get stuck

Paste your test and the output here. The two usual snags: asserting the fix instead of the rule behind it, and a test that passes even with the defect because it checks the wrong thing. Ask early; nothing here is counted against you.

<!-- Machine-readable summary read by the Kestrel platform. Keep it in step with the text above. -->

```kestrel-ticket
competency: automated-testing
level: guided
difficulty: starter
kp: 2
evidence_kind: practice
reserved_for: {{handle}}
stage: 4
steps:
  - title: "Say what it checks"
    guide: "Post in words what the test will check."
  - title: "Write the test"
    guide: "Write it in profile.test.ts, starting from the shape of the existing one."
  - title: "Watch it fail"
    guide: "Put the defect back and watch the test fail."
  - title: "Watch it pass"
    guide: "Remove the defect, watch the test pass, and open a pull request with both outputs."
acceptance_criteria:
  - "The test fails with the defect and passes without it"
  - "The test is merged and runs in CI"
resources:
  - "{{repo_url}}/blob/main/docs/CONTRIBUTING.md"
```
