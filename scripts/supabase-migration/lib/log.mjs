// Lightweight logger with phase prefix and timing.

const t0 = Date.now()

function elapsed() {
  const s = ((Date.now() - t0) / 1000).toFixed(1)
  return `+${s}s`
}

export function makeLogger(phaseId) {
  const tag = `[${phaseId}]`
  return {
    info: (...a) => console.log(`${tag} ${elapsed()}`, ...a),
    warn: (...a) => console.warn(`${tag} ${elapsed()} ⚠️`, ...a),
    err:  (...a) => console.error(`${tag} ${elapsed()} ❌`, ...a),
    ok:   (...a) => console.log(`${tag} ${elapsed()} ✅`, ...a),
    step: (label) => console.log(`\n${tag} ${elapsed()} ▶ ${label}`),
  }
}

export function fmtBytes(n) {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(1)} ${u[i]}`
}

export function fmtNum(n) {
  return n.toLocaleString('en-US')
}
