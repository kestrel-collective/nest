#!/usr/bin/env node
// Writes py/tests/golden/ from the Node data code: <case>.json for every repository in
// py/tests/fixtures/repos/, plus schema-cases.json and yaml-cases.json. Run `npx tsc -b` first.
// See py/tests/fixtures/README.md.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { goldenFor, pickCases, scaffoldCases, schemaCases, yamlCases } from '../packages/cli/dist/parity.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const repos = join(root, 'py', 'tests', 'fixtures', 'repos')
const out = join(root, 'py', 'tests', 'golden')
mkdirSync(out, { recursive: true })

for (const name of readdirSync(repos).sort()) {
  const golden = goldenFor(join(repos, name), join(out, `${name}.json`))
  writeFileSync(join(out, `${name}.json`), `${JSON.stringify(golden, null, 2)}\n`)
  console.log(
    `${name}: validate exit ${golden.validate.code}, ${golden.validate.err.length} problem line(s), index ${golden.index === null ? 'none' : `${golden.index.length} bytes`}, ${Object.keys(golden.page_status).length} page-status run(s)`,
  )
}

const cases = schemaCases()
writeFileSync(join(out, 'schema-cases.json'), `${JSON.stringify(cases, null, 1)}\n`)
console.log(
  `schema-cases: ${cases.length} cases, ${cases.filter((c) => c.issues.length > 0).length} with problems`,
)

const yamls = yamlCases()
writeFileSync(join(out, 'yaml-cases.json'), `${JSON.stringify(yamls, null, 1)}\n`)
console.log(`yaml-cases: ${yamls.length} snippets, ${yamls.filter((c) => c.error).length} refused`)

const scaffolds = scaffoldCases()
writeFileSync(join(out, 'scaffold-cases.json'), `${JSON.stringify(scaffolds, null, 1)}\n`)
console.log(
  `scaffold-cases: ${scaffolds.length} scaffolds, ${scaffolds.filter((c) => c.detected.length > 0).length} with a finding`,
)

const picks = pickCases()
writeFileSync(join(out, 'pick-cases.json'), `${JSON.stringify(picks, null, 1)}\n`)
console.log(`pick-cases: ${picks.length} draws`)
