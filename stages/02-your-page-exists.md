Hello {{name}}. Welcome to Stage {{stage_number}}, {{stage_title}}{{cohort_phrase}}.

## In one line

Finish the scaffold pull request that is already open in your name: fill in your profile and your page in your own words, set the page public, and mark the pull request ready. It merges on its own. About an hour.

## Why this matters

Your page is the thing that keeps growing for as long as you contribute, anywhere. Making it real now gives every later stage somewhere to leave evidence. It is yours: publish what you choose, edit forever, unpublish with one pull request.

## Before you start

- [ ] Stage 1 is done, so you know the loop.
- [ ] The draft pull request "Scaffold for @{{handle}}" is open in your name, from the branch `scaffold/{{handle}}`. It holds your starter directory, `contributors/{{handle}}/`, and this stage is finishing it. You work on that branch, not a new one.

## Steps

1. Get the branch: `git switch main` and `git pull`, then `git switch scaffold/{{handle}}`. The first time, git fetches it from GitHub and sets it to push back there.
2. Open `contributors/{{handle}}/profile.yml`. Fill in `name`, `intro` (one or two sentences about where you are now, not where you want to be) and up to eight `skills_developing`. `next` is optional. Leave `handle`, `cohort` and `joined` exactly as they are, even if something about them looks odd. That is Stage 3, on purpose.
3. Open `contributors/{{handle}}/page.md`. Write a few sentences under "Where I started". The other three sections: write them now, or delete them until you have something to say. A public page may not keep template text.
4. Check-in (one line): post here what your intro says. Not for approval, for the habit of saying things before they ship.
5. Run {{validate_command}}. It names the file, the line, the field and what to change. Fix only what it names, then run it again, until it says "no problems".
6. Set `visibility.page` to `public` in `profile.yml`.
7. See it before anyone else does: {{see_your_page}} Read it as a stranger would.
8. Run {{test_command}}, then commit and push to the same branch:

   ```bash
   git commit -am "feat: publish the page for {{handle}}"
   git push
   ```

9. Open the pull request "Scaffold for @{{handle}}". Edit its description and add a line with `Closes #` and this issue's number, so merging it closes this issue. Then press **Ready for review**.
10. The checks run, and a preview of the site is built from your branch. Open the preview link on the pull request and read your page as a stranger would. If something is wrong, fix it, commit and `git push` again; the pull request picks it up.
11. The pull request changes only your own directory, so marking it ready turns on auto-merge, and it merges on its own once the checks are green. A few minutes later your page is live at {{site}}/p/{{handle}}/. Check it there.

## Done when

- [ ] {{validate_command}} reports no problems.
- [ ] "Scaffold for @{{handle}}" merged without anyone else pressing a button.
- [ ] {{site}}/p/{{handle}}/ shows your name, your intro and your first section.

## If you get stuck

Paste the output of {{validate_command}} here, exactly. The message tells you what to change; if it does not, that is a bug in Nest and worth an issue of its own, which also counts as a contribution.

<!-- Machine-readable summary read by the Kestrel platform. Keep it in step with the text above. -->

```kestrel-ticket
competency: technical-communication
level: guided
difficulty: starter
kp: 1
evidence_kind: practice
reserved_for: {{handle}}
stage: 2
steps:
  - title: "Write your page"
    guide: "On the branch scaffold/{{handle}}, fill in profile.yml and page.md in your own words. Leave handle, cohort and joined as they are."
  - title: "Say it in one line"
    guide: "Post one line on this issue saying what your intro says."
  - title: "Validate"
    guide: "Run nest validate until it reports no problems."
  - title: "Publish"
    guide: "Set visibility.page to public, push, and mark the scaffold pull request ready for review. It merges on its own."
acceptance_criteria:
  - "nest validate reports no problems"
  - "Your scaffold pull request merged"
  - "Your page is live on the site"
resources:
  - "{{repo_url}}/blob/main/docs/CONTRIBUTING.md"
```
