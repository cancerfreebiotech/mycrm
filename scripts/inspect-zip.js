const fs = require('fs')
const JSZip = require('jszip')

const p = process.argv[2]
if (!p) { console.error('usage: node scripts/inspect-zip.js <path>'); process.exit(1) }

JSZip.loadAsync(fs.readFileSync(p)).then(async (zip) => {
  const entries = []
  zip.forEach((rel, e) => entries.push({ path: rel, dir: e.dir, entry: e }))
  entries.sort((a, b) => a.path.localeCompare(b.path))
  let total = 0
  for (const f of entries) {
    if (f.dir) {
      console.log('[DIR]'.padStart(11), f.path)
    } else {
      const buf = await f.entry.async('nodebuffer')
      total += buf.length
      console.log((buf.length / 1024).toFixed(1).padStart(8) + ' KB', f.path)
    }
  }
  console.log('TOTAL', (total / 1024 / 1024).toFixed(2) + ' MB across', entries.filter((f) => !f.dir).length, 'files')

  // Check for manifest.json
  const mf = zip.file('manifest.json')
  if (mf) {
    const txt = await mf.async('string')
    try {
      const m = JSON.parse(txt)
      console.log('---')
      console.log('manifest.period:', m.period)
      console.log('manifest.stories.length:', Array.isArray(m.stories) ? m.stories.length : 'NOT ARRAY')
      if (Array.isArray(m.stories)) {
        for (let i = 0; i < m.stories.length; i++) {
          const s = m.stories[i]
          console.log(`  [${i}] section=${s.section} title.zh=${s.title?.['zh-TW']?.slice(0, 30) ?? '?'} images=${(s.image_files || []).length}`)
        }
      }
    } catch (e) {
      console.log('manifest.json parse error:', e.message)
    }
  } else {
    console.log('NO manifest.json AT ROOT')
  }
})
