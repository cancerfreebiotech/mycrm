// Migration state: resume-able. Each phase writes its results here.
// Lives at: scripts/supabase-migration/artifacts/migration-state.json

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_PATH = join(__dirname, '..', 'artifacts', 'migration-state.json')

function ensureDir() {
  const dir = dirname(STATE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function loadState() {
  if (!existsSync(STATE_PATH)) return { phases: {}, createdAt: new Date().toISOString() }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
}

export function saveState(state) {
  ensureDir()
  state.updatedAt = new Date().toISOString()
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

export function recordPhase(phaseId, data) {
  const state = loadState()
  state.phases[phaseId] = {
    ...data,
    completedAt: new Date().toISOString(),
  }
  saveState(state)
  return state
}

export function getPhase(phaseId) {
  const state = loadState()
  return state.phases[phaseId]
}

export function isPhaseDone(phaseId) {
  return !!getPhase(phaseId)
}
