// The shared-pool backlog: reading docs/backlog-seed.md, the labels each issue is opened with, and
// creating an issue so that it never lands without them. scripts/open-backlog.mjs is the command;
// scripts/backlog.test.ts tests this module with a fake gh.

/** The pool label. Every issue opened with it is a Stage 5 issue too (stages/README.md). */
export const SHARED_ISSUE_LABEL = 'good-shared-issue'
/** The stage label every shared-pool issue carries; SHARED_STAGE in @nest/schema is 5. */
export const SHARED_STAGE_LABEL = 'stage:5'
export const TRACKS = ['js', 'python']

/** The labels a shared-pool issue on this track is created with, always all three together. */
export function issueLabels(track) {
  if (!TRACKS.includes(track)) throw new Error(`A shared issue needs a track, js or python; got ${track}.`)
  return [SHARED_ISSUE_LABEL, SHARED_STAGE_LABEL, `track:${track}`]
}

/** Every level-two section of the seed file as { title, body: string[], track }. */
export function parseBacklog(text) {
  const issues = []
  let current = null
  for (const line of text.split('\n')) {
    const m = /^## (.+)$/.exec(line)
    if (m) {
      if (current) issues.push(current)
      current = { title: m[1].trim(), body: [], track: null }
      continue
    }
    const t = /^Track: (js|python)\s*$/.exec(line)
    if (current && t && current.track === null) {
      current.track = t[1]
      continue
    }
    if (current) current.body.push(line.replace(/^### /, '## '))
  }
  if (current) issues.push(current)
  return issues
}

/** The issue body, with the note on its first line when one is given. */
export function issueBody(issue, note) {
  const own = issue.body.join('\n').trim() + '\n'
  return note ? `${note}\n\n${own}` : own
}

/**
 * Creates every label in `names` that the repository does not have yet, from its definition in
 * .github/labels.json, and returns the names it created. A name with no definition is an error, raised
 * before anything is created. `gh(args, input)` runs the GitHub CLI and returns its standard output.
 */
export function ensureLabels(repo, names, definitions, gh) {
  const have = new Set(
    JSON.parse(gh(['label', 'list', '--repo', repo, '--limit', '500', '--json', 'name'])).map((l) => l.name),
  )
  const missing = [...new Set(names)].filter((n) => !have.has(n))
  const undefinedNames = missing.filter((n) => !definitions.some((d) => d.name === n))
  if (undefinedNames.length > 0) {
    throw new Error(`Not in .github/labels.json, so not created: ${undefinedNames.join(', ')}`)
  }
  for (const name of missing) {
    const def = definitions.find((d) => d.name === name)
    gh(['label', 'create', name, '--repo', repo, '--color', def.color, '--description', def.description])
  }
  return missing
}

/** The labels from an issue or labels API response that are not in `want`. */
function lacking(want, response) {
  const got = new Set(response.map((l) => (typeof l === 'string' ? l : l.name)))
  return want.filter((l) => !got.has(l))
}

/**
 * Creates the issue with its three labels through the REST API and checks the labels on the issue the
 * response describes. A label missing from it is added once more; if it is still missing, this throws
 * with the issue's number, so nobody is left believing it is labelled.
 */
export function createIssue(repo, issue, body, gh) {
  const labels = issueLabels(issue.track)
  const created = JSON.parse(
    gh(
      ['api', `repos/${repo}/issues`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ title: issue.title, body, labels }),
    ),
  )
  let missing = lacking(labels, created.labels ?? [])
  if (missing.length > 0) {
    const after = JSON.parse(
      gh(
        ['api', `repos/${repo}/issues/${created.number}/labels`, '--method', 'POST', '--input', '-'],
        JSON.stringify({ labels: missing }),
      ),
    )
    missing = lacking(labels, after)
  }
  if (missing.length > 0) {
    throw new Error(`#${created.number} (${issue.title}) was created without ${missing.join(', ')}.`)
  }
  return { number: created.number, url: created.html_url, labels }
}
