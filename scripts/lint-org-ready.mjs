import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================
// lint-org-ready — v8.0 多租戶化「技術債儀表」（Phase 0）
//
// 掃 src/app/api/**/route.ts，統計哪些 route 仍：
//   1. 直接呼叫 createServiceClient()，且
//   2. 字面查詢業務表（from('contacts' | 'tasks' | 'interaction_logs'
//      | 'newsletter_*')），且
//   3. 尚未 import orgContext（@/lib/orgContext）
//
// 這些就是 Phase 1 需要遷移到 getOrgContext() + orgScopedClient() 的 route。
//
// 定位：技術債儀表，**不是 CI gate**。永遠 exit 0，不 fail build / CI。
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, '..', 'src', 'app', 'api');

// 業務表：contacts / tasks / interaction_logs 精確比對，newsletter_ 為前綴
const BUSINESS_TABLE_RE =
  /\bfrom\(\s*['"`](contacts|tasks|interaction_logs|newsletter_[a-z0-9_]*)['"`]/g;
const SERVICE_CLIENT_RE = /createServiceClient\s*\(/;
const ORG_CONTEXT_RE = /orgContext/;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.name === 'route.ts') {
      files.push(full);
    }
  }
  return files;
}

const routes = walk(API_DIR);
const notOrgReady = [];

for (const file of routes) {
  const content = fs.readFileSync(file, 'utf8');

  const usesServiceClient = SERVICE_CLIENT_RE.test(content);
  const importsOrgContext = ORG_CONTEXT_RE.test(content);

  const tables = new Set();
  let m;
  BUSINESS_TABLE_RE.lastIndex = 0;
  while ((m = BUSINESS_TABLE_RE.exec(content)) !== null) {
    tables.add(m[1]);
  }

  if (usesServiceClient && tables.size > 0 && !importsOrgContext) {
    notOrgReady.push({
      file: path.relative(path.resolve(__dirname, '..'), file),
      tables: [...tables].sort(),
    });
  }
}

notOrgReady.sort((a, b) => a.file.localeCompare(b.file));

console.log('=== org-ready lint（Phase 0 技術債儀表）===\n');
console.log(`掃描 route.ts：${routes.length} 支`);
console.log(`未 org-ready（用 service client 查業務表且未 import orgContext）：${notOrgReady.length} 支\n`);

if (notOrgReady.length > 0) {
  for (const { file, tables } of notOrgReady) {
    console.log(`  - ${file}  [${tables.join(', ')}]`);
  }
  console.log('');
}

console.log(`小結：${routes.length} 支 route 中，${notOrgReady.length} 支待 Phase 1 遷移。`);

// 技術債儀表，永不 fail。
process.exit(0);
