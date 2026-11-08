Hello {{name}}. Welcome to Stage {{stage_number}}, {{stage_title}}{{cohort_phrase}}.

## In one line

Review one pull request from a peer properly, and have one of yours reviewed by a peer. About two hours, across a week.

## Why this matters

Review is half of open-source work, and the half almost nobody is taught. A reviewer who was not there can only trust what the description explains. Your job as a reviewer is to check that it can be trusted, kindly and specifically. Your job as an author is to answer every comment, with a change or with a reason.

## Steps

1. Find an open pull request from another cohort member: [open pull requests not by you]({{repo_url}}/pulls?q=is%3Apr+is%3Aopen+-author%3A{{handle}}). Stage 2 to 5 pull requests are all fine to review.
2. Read the description first, then the diff. Ask yourself the reviewer's question: what would I need, having never met this person, to merge this safely?
3. Run it. `git fetch origin && git switch <branch>`, then {{test_command}}, and for a page {{see_their_page}} to look at it. Reading alone misses things running finds.
4. Leave at least one comment on a specific line. Say what you see, why it matters, and what you would change. A question is a good comment. "Looks good" on its own is not a review.
5. Finish the review: approve if you would merge it, or request changes if something has to change first. Either is a real outcome.
6. The other side. Ask a cohort member to review one of your open pull requests, or your next one. Reply to every comment they leave, with a change or a reason. Thank them in the pull request.

## Done when

- [ ] You reviewed a peer's pull request with at least one line comment and a verdict, and that pull request has since merged.
- [ ] A peer reviewed one of yours and you answered every comment.
- [ ] You can name one thing you would do differently in your own code after reading theirs.

## If you get stuck

If there is no open pull request to review, say so here and a maintainer will point you at one, possibly in shared code. If a review you received felt unkind, read [CODE_OF_CONDUCT.md]({{repo_url}}/blob/main/CODE_OF_CONDUCT.md) and tell a maintainer; that is what it is for.

<!-- Machine-readable summary read by the Kestrel platform. Keep it in step with the text above. -->

```kestrel-ticket
competency: technical-communication
level: supported
difficulty: standard
kp: 1
evidence_kind: practice
reserved_for: {{handle}}
stage: 6
steps:
  - title: "Read and run it"
    guide: "Read a peer's pull request, description first, then run it."
  - title: "Review it"
    guide: "Leave at least one line comment and a verdict."
  - title: "Be reviewed"
    guide: "Ask a peer to review one of yours, and answer every comment."
acceptance_criteria:
  - "You reviewed a peer pull request that has merged"
  - "A peer reviewed one of yours"
resources:
  - "{{repo_url}}/blob/main/docs/CONTRIBUTING.md"
```
