// One-off: extract prose from past newsletter HTML files into tone-samples markdown.
// Run: node scripts/extract-tone-samples.js
// Source: C:\Users\PoChen\Downloads\newsletter\*.txt (HTML email exports)
// Output: skills/newsletter-composer/tone-samples/YYYY-MM-{zh|en|ja}.md

const fs = require('fs')
const path = require('path')

const SRC = 'C:\\Users\\PoChen\\Downloads\\newsletter'
const OUT = path.join(__dirname, '..', 'skills', 'newsletter-composer', 'tone-samples')
const BR_SENTINEL = ''

const langMap = { '中文': 'zh', '英文': 'en', '日文': 'ja' }

function trimInner(s) {
  return s.replace(/[ \t\n\r\f\v]+/g, ' ').trim()
}

function htmlToMarkdown(html) {
  let t = html
  t = t.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  t = t.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  t = t.replace(/<!--[\s\S]*?-->/g, '')
  t = t.replace(/<!doctype[^>]*>/gi, '')

  // <br> → sentinel char (preserved through trimInner; restored at end)
  t = t.replace(/<br\s*\/?>/gi, BR_SENTINEL)

  // Inline first
  t = t.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
  t = t.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
  t = t.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
  t = t.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
  t = t.replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, label) => {
    const lbl = trimInner(label)
    if (!lbl) return ''
    return `[${lbl}](${url})`
  })
  t = t.replace(/<img\s[^>]*\/?>/gi, '')

  // Block — process <p> FIRST so <li><p>X</p></li> works correctly
  t = t.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, x) => {
    const inner = trimInner(x)
    return inner ? `\n${inner}\n` : '\n'
  })
  t = t.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, x) => {
    const inner = trimInner(x)
    return inner ? `- ${inner}\n` : ''
  })
  t = t.replace(/<\/?ul[^>]*>/gi, '\n')
  t = t.replace(/<\/?ol[^>]*>/gi, '\n')
  t = t.replace(/<h([12])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, x) => {
    const inner = trimInner(x)
    return inner ? `\n\n## ${inner}\n\n` : '\n'
  })
  t = t.replace(/<h([34])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, x) => {
    const inner = trimInner(x)
    return inner ? `\n\n### ${inner}\n\n` : '\n'
  })
  t = t.replace(/<hr[^>]*\/?>/gi, '\n---\n')

  // Strip remaining tags
  t = t.replace(/<[^>]+>/g, '')

  // Decode entities
  t = t.replace(/&nbsp;/g, ' ')
   .replace(/&amp;/g, '&')
   .replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"')
   .replace(/&#39;/g, "'")

  // Sentinel back to newline
  t = t.split(BR_SENTINEL).join('\n')

  // Normalize whitespace (don't touch \n)
  t = t.replace(/[ \t]+/g, ' ')
  t = t.replace(/ \n/g, '\n')
  t = t.replace(/\n[ \t]+/g, '\n')
  t = t.replace(/\n{3,}/g, '\n\n')
  return t.trim()
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const summary = []
for (const f of fs.readdirSync(SRC)) {
  const m = f.match(/^(\d{2})(\d{2})\s+(中文|英文|日文)電子報\.txt$/)
  if (!m) continue
  const yymm = `20${m[1]}-${m[2]}`
  const lang = langMap[m[3]]
  const html = fs.readFileSync(path.join(SRC, f), 'utf8')
  if (html.length < 100) {
    summary.push(`SKIP ${f} (only ${html.length} bytes)`)
    continue
  }
  const md = htmlToMarkdown(html)
  const outFile = path.join(OUT, `${yymm}-${lang}.md`)
  fs.writeFileSync(outFile, `# Newsletter ${yymm} (${lang})\n\n_Source: ${f} — extracted for tone reference_\n\n---\n\n${md}\n`)
  summary.push(`✓ ${path.basename(outFile)} (${md.length} chars)`)
}

console.log(summary.join('\n'))
