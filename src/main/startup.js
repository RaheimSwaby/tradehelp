import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs'
import { dirname } from 'path'

const DEFAULT_MAX_LOG_BYTES = 256 * 1024

function formatPart(part) {
  if (part instanceof Error) return `${part.message}\n${part.stack || ''}`
  if (typeof part === 'string') return part
  try { return JSON.stringify(part) } catch { return String(part) }
}

export function createStartupLogger(filePath, { maxBytes = DEFAULT_MAX_LOG_BYTES } = {}) {
  function rotateIfLarge() {
    try {
      if (!existsSync(filePath) || statSync(filePath).size <= maxBytes) return
      const previous = `${filePath}.1`
      if (existsSync(previous)) unlinkSync(previous)
      renameSync(filePath, previous)
    } catch {}
  }

  function write(level, parts) {
    const line = `${new Date().toISOString()} [${level}] ${parts.map(formatPart).join(' ')}\n`
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      rotateIfLarge()
      appendFileSync(filePath, line, 'utf8')
    } catch {}

    if (level === 'ERROR') console.error('[startup]', line.trim())
    else if (level === 'WARN') console.warn('[startup]', line.trim())
    else console.log('[startup]', line.trim())
  }

  return {
    filePath,
    info: (...parts) => write('INFO', parts),
    warn: (...parts) => write('WARN', parts),
    error: (...parts) => write('ERROR', parts)
  }
}

export function withDeadline(promise, timeoutMs, message = 'Startup step timed out') {
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    timer.unref?.()
  })
  return Promise.race([Promise.resolve(promise), deadline]).finally(() => clearTimeout(timer))
}
