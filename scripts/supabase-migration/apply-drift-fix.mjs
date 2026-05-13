// Apply drift-fix.sql to the target project.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mgmtSql } from './lib/clients.mjs'
import { loadState } from './lib/state.mjs'
import { makeLogger } from './lib/log.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const log = makeLogger('drift-fix')

const target = loadState().phases['01-create-target']
if (!target?.projectRef) throw new Error('Phase 01 must complete first')

const sql = readFileSync(join(__dirname, 'drift-fix.sql'), 'utf8')
log.step(`Applying drift-fix.sql to ${target.projectRef}`)
await mgmtSql(target.projectRef, sql)
log.ok('drift-fix applied')
