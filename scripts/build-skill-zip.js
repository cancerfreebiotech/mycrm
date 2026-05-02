// Build newsletter-composer.zip for Claude.ai Skills upload.
// Run: node scripts/build-skill-zip.js
// Output: skills/newsletter-composer/newsletter-composer.zip
//
// NOTE: tone-samples/ is intentionally excluded — those go to Project Knowledge,
// not into the skill zip itself.

const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')

const ROOT = path.join(__dirname, '..', 'skills', 'newsletter-composer')
const OUT = path.join(ROOT, 'newsletter-composer.zip')

const INCLUDE = [
  'SKILL.md',
  'manifest-schema.json',
  'assets',
  'examples',
]

async function addPath(zip, absPath, relPath) {
  const stat = fs.statSync(absPath)
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(absPath)) {
      await addPath(zip, path.join(absPath, entry), path.posix.join(relPath, entry))
    }
  } else {
    zip.file(relPath, fs.readFileSync(absPath))
  }
}

async function main() {
  const zip = new JSZip()
  for (const item of INCLUDE) {
    const src = path.join(ROOT, item)
    if (!fs.existsSync(src)) {
      console.error(`MISSING: ${src}`)
      process.exit(1)
    }
    await addPath(zip, src, item)
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.writeFileSync(OUT, buf)
  const kb = (buf.length / 1024).toFixed(1)
  console.log(`✓ ${OUT} (${kb} KB)`)
  console.log('  Upload this zip to Claude.ai → Project Settings → Skills.')
}

main().catch((e) => { console.error(e); process.exit(1) })
