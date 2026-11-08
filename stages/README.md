# Stage issue bodies

One Markdown file per stage of the ladder, or two where the stage reads differently on each track (ADR 0010). `nest new-task <stage> --handle <handle>` fills in the placeholders and prints or creates the issue. `nest enroll` and `nest open-cohort` do it for every personal stage, with the variant for the member's track.

- Stages 1, 3, 4 and 5 have one body per track: `01-make-it-run.js.md` and `01-make-it-run.python.md`. Each has its own kestrel-ticket block, and the stage-upkeep job refreshes an open issue from the variant its `track:` label names.
- Stages 2, 6 and 7 are shared: `02-your-page-exists.md`. Words that differ by track are placeholders.

Placeholders: `{{handle}}`, `{{name}}`, `{{cohort}}` (or `none`), `{{cohort_phrase}}` (", for cohort <id>" or empty), `{{repo}}`, `{{repo_url}}`, `{{site}}`, `{{stage_number}}`, `{{stage_title}}`, and for the shared bodies `{{track}}` (`js` or `python`), `{{validate_command}}`, `{{test_command}}`, `{{see_your_page}}` and `{{see_their_page}}`, defined in `trackVars` in `packages/cli/src/issue-body.ts`.

Stage 5 has a body too, but it is never opened as a personal issue. Members claim an issue labelled `good-shared-issue` and their track's label, `track:js` or `track:python`, instead.
