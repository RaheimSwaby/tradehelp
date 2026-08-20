import electronUpdater from 'electron-updater'
import { app, ipcMain, shell } from 'electron'
import { appendFileSync, existsSync, mkdirSync, statSync, renameSync } from 'fs'
import { join } from 'path'

const { autoUpdater } = electronUpdater

// Why this file writes a log at all:
//
// Across five releases, latest.yml (Windows) was fetched 23 to 115 times each,
// while latest-mac.yml and latest-linux.yml were fetched zero times, against 295
// macOS and 96 Linux installer downloads. Those clients are not checking for
// updates, and every failure path here used to be an empty catch, so nothing was
// ever recorded. The cause cannot be guessed at from a Windows machine; it needs a
// log from an affected install.
//
// electron-updater takes a `logger`, and its internal messages are the useful part:
// on an unsigned or improperly signed macOS build it reports the signature problem
// before any network request, which matches a manifest fetch count of zero.
//
// ─────────────────────────────────────────────────────────────────────────────
// DO NOT REMOVE THE LOGGING OR RESTORE THE EMPTY CATCHES.
//
// This looks like debug scaffolding worth tidying up. It is not — it is the only
// instrument on a platform nobody here can run. There is no Mac on this project,
// so `updater.log` from an affected install is the sole way this gets diagnosed.
// Deleting `autoUpdater.logger`, the `.on('error')` handler, or the `update:log`
// IPC returns this bug to being invisible, which is how it survived unnoticed
// from v0.40.0 to v0.48.1.
//
// Still open as of 2026-08-20 (v0.50.0). Manifest fetches per release, from
// `gh api repos/RaheimSwaby/tradehelp/releases`:
//
//     tag       latest.yml   latest-mac.yml
//     v0.50.0        67            0
//     v0.49.1       314           10
//     v0.49.0       105            0
//     v0.48.3       186            0
//     v0.48.2       132            0
//
// macOS is ~36% of installs but ~3% of update checks. The v0.48.2 release-side
// repairs (forceCodeSigning, strict asset verification) did not move it, so the
// remaining fault is client-side and still unidentified.
//
// Before concluding this is fixed, re-run the counts above and require
// latest-mac.yml to be a believable fraction of latest.yml — not merely nonzero.
// See the guard block at the top of package.json for the build config this
// depends on.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LOG_BYTES = 256 * 1024

function logDir() {
  const dir = join(app.getPath('userData'), 'logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function updaterLogPath() {
  return join(logDir(), 'updater.log')
}

// One rotation, so a long-running install cannot grow this without bound while a
// crash right after the interesting line still leaves that line on disk.
function rotateIfLarge(file) {
  try {
    if (existsSync(file) && statSync(file).size > MAX_LOG_BYTES) renameSync(file, file + '.1')
  } catch {}
}

function write(level, parts) {
  const line = `${new Date().toISOString()} [${level}] ${parts
    .map((p) => (p instanceof Error ? `${p.message}\n${p.stack || ''}` : typeof p === 'string' ? p : JSON.stringify(p)))
    .join(' ')}\n`
  try {
    const file = updaterLogPath()
    rotateIfLarge(file)
    appendFileSync(file, line)
  } catch {}
  // Also to stdout, so `npm run dev` shows it without hunting for the file.
  if (level === 'ERROR') console.error('[updater]', line.trim())
  else console.log('[updater]', line.trim())
}

const log = {
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a),
  debug: (...a) => write('DEBUG', a)
}

export function initUpdater(getWindow) {
  ipcMain.handle('update:install', () => {
    try { autoUpdater.quitAndInstall() } catch (e) { log.error('quitAndInstall failed', e) }
  })
  ipcMain.handle('update:check', async () => {
    try { return await autoUpdater.checkForUpdates() } catch (e) { log.error('manual check failed', e); return null }
  })
  // The preload exposes downloadUpdate(); without this it rejected with "No handler
  // registered". autoDownload is on below, so this only matters when a check has run
  // with autoDownload disabled, or the user retries a download that failed.
  ipcMain.handle('update:download', async () => {
    try { return await autoUpdater.downloadUpdate() } catch (e) { log.error('manual download failed', e); return null }
  })

  // Lets a user on an affected platform find the log without being talked through
  // the userData path over Discord.
  ipcMain.handle('update:log', () => updaterLogPath())
  ipcMain.handle('update:log:show', () => { try { shell.showItemInFolder(updaterLogPath()) } catch {} })

  if (!app.isPackaged) {
    log.info('unpackaged run, automatic checks disabled')
    return
  }

  // electron-updater's own diagnostics. This is the line that should reveal why
  // macOS and Linux never reach the feed.
  autoUpdater.logger = log

  log.info('init', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    // A macOS app updating from outside /Applications is a known failure mode.
    path: app.getPath('exe')
  })

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => log.info('checking for update'))
  autoUpdater.on('update-available', (info) => log.info('update available', { version: info?.version }))
  autoUpdater.on('update-not-available', (info) => log.info('already current', { version: info?.version }))
  autoUpdater.on('download-progress', (p) => log.debug('downloading', { percent: Math.round(p?.percent || 0) }))

  autoUpdater.on('update-downloaded', (info) => {
    log.info('update downloaded', { version: info?.version })
    getWindow()?.webContents.send('update:ready', { version: info.version })
  })

  // Previously an empty handler, which is how this stayed invisible.
  autoUpdater.on('error', (err) => log.error('autoUpdater error', err))

  const check = () => autoUpdater.checkForUpdates().catch((e) => log.error('scheduled check failed', e))

  check()
  // Poll every 30 minutes (plus on window focus). A short testing interval had been
  // left in, which made every install hammer the update feed and swamped the metrics.
  setInterval(check, 30 * 60 * 1000)
  app.on('browser-window-focus', () => check())
}
