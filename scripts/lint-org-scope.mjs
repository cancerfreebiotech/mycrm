#!/usr/bin/env node
/**
 * lint-org-scope — v8.0 Phase 1（Task 178）
 *
 * 規則：src/app/api 的 route 與 src/lib 的模組，凡以字串常值 `.from('<業務表>')`
 * 存取 org-scoped 業務表（清單解析自 src/lib/orgTables.ts），檔案內必須引用
 * `@/lib/orgContext`（orgScopedClient / systemOrgContext / OrgDb 之一）——
 * 否則視為「裸 service client 存取業務表」，exit 1 擋下 build。
 *
 * 掛載：package.json `prebuild`（Vercel build 與本機 `npm run build` 都會跑）。
 * 手動：`npm run lint:org`
 *
 * 限制（有意為之的啟發式）：動態表名 `.from(變數)` 只警告不擋；
 * client 元件（src/app/(dashboard)）走 anon client + RLS，屬 Phase 2 範圍不在此檢查。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')

// ── 業務表清單：單一真相來源 orgTables.ts ──
const tablesSrc = readFileSync(join(ROOT, 'src/lib/orgTables.ts'), 'utf8')
const listMatch = tablesSrc.match(/ORG_TABLE_NAMES = \[([\s\S]*?)\] as const/)
if (!listMatch) {
  console.error('lint-org-scope: 無法從 src/lib/orgTables.ts 解析 ORG_TABLE_NAMES')
  process.exit(2)
}
const TABLES = [...listMatch[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

// ── 掃描對象：所有 API route + src/lib 頂層模組 ──
const targets = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name === 'route.ts') targets.push(p)
  }
}
walk(join(ROOT, 'src/app/api'))
for (const name of readdirSync(join(ROOT, 'src/lib'))) {
  if (name.endsWith('.ts')) targets.push(join(ROOT, 'src/lib', name))
}

const ALLOW = new Set(['src/lib/orgContext.ts', 'src/lib/orgTables.ts'])

const violations = []
const warnings = []
for (const file of targets) {
  const rel = relative(ROOT, file)
  if (ALLOW.has(rel)) continue
  const src = readFileSync(file, 'utf8')

  const used = TABLES.filter(
    (t) => src.includes(`.from('${t}')`) || src.includes(`.from("${t}")`)
  )
  if (used.length > 0 && !/from ['"][^'"]*orgContext['"]/.test(src)) {
    violations.push(`${rel}: 存取業務表 [${used.join(', ')}] 但未引用 @/lib/orgContext`)
  }

  // 動態表名：無法靜態判斷是否業務表 → 警告
  const dynamic = src.match(/\.from\((?!['"`])[a-zA-Z_$]/g)
  if (dynamic) warnings.push(`${rel}: ${dynamic.length} 處動態表名 .from(變數)，請人工確認 org scoping`)
}

if (warnings.length > 0) {
  console.warn('lint-org-scope 警告（不擋 build）：')
  for (const w of warnings) console.warn('  ⚠ ' + w)
}
if (violations.length > 0) {
  console.error('lint-org-scope 違規（業務表必須經 orgScopedClient，見 src/lib/orgContext.ts）：')
  for (const v of violations) console.error('  ✗ ' + v)
  process.exit(1)
}
console.log(`lint-org-scope: OK（${targets.length} 檔掃描，${TABLES.length} 張業務表）`)
