Hello {{name}}. Welcome to Stage {{stage_number}}, {{stage_title}}{{cohort_phrase}}.

This stage is not assigned to you. You claim it from the pool when you are ready.

## In one line

Your first change outside your own directory: a real issue in Nest's shared code, with a real review. One to two weeks, at your pace.

## Why this matters

Everything so far affected only you. Shared code is different: other pages, other people and the site itself depend on it. The loop is the one you already know, orient, reproduce, say it before you look, fix, prove, explain, but with fewer prompts. The issue gives you context, steps and acceptance criteria, not a walkthrough. That is the transfer, and it is the skill that works in any repository afterwards.

## Steps

1. Open the pool: [issues labelled good-shared-issue and track:js]({{repo_url}}/issues?q=is%3Aopen+label%3Agood-shared-issue+label%3Atrack%3Ajs+no%3Aassignee). Read one twice. Pick it only if you can say in your own words what it asks.
2. Comment "I'll take this" on it. A maintainer assigns it to you. One at a time.
3. Orient. Post one line on the issue: where in the code you expect the change to live, and why.
4. Reproduce the problem or the gap on your machine before changing anything, exactly as in Stage 3. Post what you saw.
5. Make the change on a branch named after the issue number, with a test when the acceptance criteria ask for one. Run `npm run validate`, `npm test`, `npm run lint` and `npm run build`.
6. Open the pull request with four short parts: what changed, why, how you checked each acceptance criterion, and what it does not cover. `Closes #` and the issue's number.
7. Review. A maintainer reads it and leaves comments. Answer every one, either with a change or with a reason. Keeping a decision and explaining why is as legitimate as changing it. Push again. Two or three rounds is the normal shape of shared work, not a sign of trouble.
8. When it merges it is in the next release, credited to you in the changelog, and your page counts it as a shared-project contribution after the next counts run.

## Done when

- [ ] Your change to shared code is merged after a review.
- [ ] Every acceptance criterion on the issue was checked and the pull request says how.
- [ ] Your page shows one shared-project contribution.

## If you get stuck

Comment on the issue you claimed, not here. If the issue itself turned out to be wrong or unclear, say that: fixing the issue text is also a contribution. A pull request that was reviewed properly and not merged is not a failure; say what you learned from the review in your reflection.

<!-- Machine-readable summary read by the Kestrel platform. Keep it in step with the text above. -->

```kestrel-ticket
competency: debugging
level: supported
difficulty: standard
kp: 3
evidence_kind: shared_project
reserved_for: null
stage: 5
steps:
  - title: "Claim a shared issue"
    guide: "Claim an issue labelled good-shared-issue."
  - title: "Reproduce first"
    guide: "Post where you expect the change to live, then reproduce the problem before changing anything."
  - title: "Change it with a test"
    guide: "Make the change with a test and open a pull request saying what, why, how you checked it and what it does not cover."
  - title: "Answer the review"
    guide: "Answer every review comment with a change or a reason."
acceptance_criteria:
  - "Your change to shared code is merged after review"
  - "Every acceptance criterion was checked"
resources:
  - "{{repo_url}}/blob/main/docs/CONTRIBUTING.md"
```
