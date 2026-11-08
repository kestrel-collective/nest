Hello {{name}}. Welcome to Stage {{stage_number}}, {{stage_title}}{{cohort_phrase}}.

## In one line

Fill in your profile and your page in your own words, and set the page live through the same loop as Stage 1. About an hour.

## Why this matters

Your page is the thing that keeps growing for as long as you contribute, anywhere. Making it real now gives every later stage somewhere to leave evidence. It is yours: publish what you choose, edit forever, unpublish with one pull request.

## Before you start

- [ ] The pull request "Scaffold for @{{handle}}" has merged. Then: `git switch main` and `git pull`. Your directory is `contributors/{{handle}}/`.
- [ ] Stage 1 is done, so you know the loop.

## Steps

1. Make a branch: `git switch -c stage-2-{{handle}}`.
2. Open `contributors/{{handle}}/profile.yml`. Fill in `name`, `intro` (one or two sentences about where you are now, not where you want to be) and up to eight `skills_developing`. `next` is optional. Leave `handle`, `cohort` and `joined` exactly as they are, even if something about them looks odd. That is Stage 3, on purpose.
3. Open `contributors/{{handle}}/page.md`. Write a few sentences under "Where I started". The other three sections: write them now, or delete them until you have something to say. A public page may not keep template text.
4. Check-in (one line): post here what your intro says. Not for approval, for the habit of saying things before they ship.
5. Run {{validate_command}}. It names the file, the line, the field and what to change. Fix only what it names, then run it again, until it says "no problems".
6. Set `visibility.page` to `public` in `profile.yml`.
7. See it before anyone else does: {{see_your_page}} Read it as a stranger would.
8. Run {{test_command}}, then commit and push:

   ```bash
   git commit -am "feat: publish the page for {{handle}}"
   git push -u origin stage-2-{{handle}}
   ```

   Open the pull request and write `Closes #` and this issue's number.

9. The checks run, and a preview of the site is built from your branch. Open the preview link on the pull request and read your page as a stranger would.
10. This pull request changes only your own directory, so it merges on its own once the checks are green. A few minutes later your page is live at {{site}}/p/{{handle}}/.

## Done when

- [ ] {{validate_command}} reports no problems.
- [ ] Your pull request merged without anyone else pressing a button.
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
    guide: "Fill in profile.yml and page.md in your own words."
  - title: "Say it in one line"
    guide: "Post one line on this issue saying what your intro says."
  - title: "Validate"
    guide: "Run nest validate until it reports no problems."
  - title: "Publish"
    guide: "Set visibility.page to public and open a pull request."
acceptance_criteria:
  - "nest validate reports no problems"
  - "Your page is live on the site"
resources:
  - "{{repo_url}}/blob/main/docs/CONTRIBUTING.md"
```
