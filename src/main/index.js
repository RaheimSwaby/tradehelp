import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } from 'electron'
import { extname, join } from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { pathToFileURL } from 'url'
import * as db from './db.js'
import { chat, chatStream, models } from './ai.js'
import { fetchPrice, fetchQuotes } from './price.js'
import { fetchEvents } from './events.js'
import { initUpdater } from './updater.js'
import * as license from './license.js'
import { testKey } from './keytest.js'

let win
let settingsCache = null
let videoPickCleanupTimer = null
const VIDEO_SCHEME = 'tradehelp-media'
const VIDEO_PICK_TTL_MS = 15 * 60 * 1000
const MAX_VIDEO_PICKS = 10
const pendingVideoPicks = new Map()
const BG_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

protocol.registerSchemesAsPrivileged([{
  scheme: VIDEO_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}])
function cachedSettings() {
  if (!settingsCache) settingsCache = db.getSettings()
  return settingsCache
}

function appearanceDir() {
  const dir = join(app.getPath('userData'), 'appearance')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function backgroundPath(file) {
  const name = String(file || '')
  if (!/^custom-background\.(png|jpg|jpeg|webp)$/i.test(name)) return ''
  return join(appearanceDir(), name)
}

function purgeExpiredVideoPicks() {
  const now = Date.now()
  for (const [token, picked] of pendingVideoPicks) {
    if (picked.expiresAt <= now) pendingVideoPicks.delete(token)
  }
}

function publicVideo(video) {
  return { ...video, url: `${VIDEO_SCHEME}://video/${encodeURIComponent(video.id)}` }
}

function publicVideos(videos) {
  return videos.map(publicVideo)
}

function safeVideoError(error, fallback) {
  const message = String(error?.message || '')
  if (/^(Use an MP4|The selected recording|Each recording|Trade not found)/.test(message)) return message
  return fallback
}

function registerVideoProtocol() {
  protocol.handle(VIDEO_SCHEME, async (request) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
      const url = new URL(request.url)
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (url.hostname !== 'video' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return new Response(null, { status: 404 })
      }
      const video = db.getTradeVideoFile(id)
      if (!video) return new Response(null, { status: 404 })
      const response = await net.fetch(pathToFileURL(video.path).toString(), {
        method: request.method,
        headers: request.headers,
        bypassCustomProtocolHandlers: true
      })
      const headers = new Headers(response.headers)
      headers.set('Content-Type', video.mimeType)
      headers.set('Cache-Control', 'private, no-store')
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0E1117',
    title: 'TradeHelp',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // electron-vite injects ELECTRON_RENDERER_URL in dev; load the built file otherwise.
  const devUrl = process.env.ELECTRON_RENDERER_URL
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[renderer] failed to load (${code}): ${description}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process exited:', details.reason, details.exitCode)
  })
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`)
  })
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.tradehelp.app') // so Windows notifications show "TradeHelp", not "electron.app"
  db.initDb()
  registerVideoProtocol()
  videoPickCleanupTimer = setInterval(purgeExpiredVideoPicks, 60_000)
  videoPickCleanupTimer.unref?.()
  db.backupDb()
  registerIpc()
  createWindow()
  initUpdater(() => win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  if (videoPickCleanupTimer) clearInterval(videoPickCleanupTimer)
  pendingVideoPicks.clear()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerIpc() {
  ipcMain.handle('trades:list', () => db.listTrades())
  ipcMain.handle('trades:add', (_e, t) => db.addTrade(t))
  ipcMain.handle('trades:update', (_e, t) => db.updateTrade(t))
  ipcMain.handle('trades:import', (_e, rows) => db.importTrades(rows))
  ipcMain.handle('trades:delete', (_e, id) => db.deleteTrade(id))
  ipcMain.handle('fills:list', (_e, tradeId) => db.listTradeFills(tradeId))
  ipcMain.handle('fills:replace', (_e, tradeId, fills) => db.replaceTradeFills(tradeId, fills))

  ipcMain.handle('profiles:list', () => db.listInstrumentProfiles())
  ipcMain.handle('profiles:add', (_e, profile) => db.addInstrumentProfile(profile))
  ipcMain.handle('profiles:update', (_e, profile) => db.updateInstrumentProfile(profile))
  ipcMain.handle('profiles:delete', (_e, id) => db.deleteInstrumentProfile(id))

  ipcMain.handle('searches:list', () => db.listSavedSearches())
  ipcMain.handle('searches:add', (_e, search) => db.addSavedSearch(search))
  ipcMain.handle('searches:update', (_e, search) => db.updateSavedSearch(search))
  ipcMain.handle('searches:delete', (_e, id) => db.deleteSavedSearch(id))

  ipcMain.handle('data:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: `tradehelp-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { ok: false }
    try { writeFileSync(filePath, JSON.stringify(db.getAllData(), null, 2)); return { ok: true, path: filePath } }
    catch (e) { return { ok: false, error: String(e?.message || e) } }
  })
  ipcMain.handle('data:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (canceled || !filePaths?.[0]) return { ok: false }
    try { return { ok: true, data: db.restoreData(JSON.parse(readFileSync(filePaths[0], 'utf8'))) } }
    catch (e) { return { ok: false, error: String(e?.message || e) } }
  })
  ipcMain.handle('data:openFolder', () => shell.openPath(app.getPath('userData')))

  ipcMain.handle('report:savePng', async (_e, dataUrl, suggestedName) => {
    const match = String(dataUrl || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)
    if (!match || match[1].length > 20_000_000) return { ok: false, error: 'Invalid report image.' }
    const safeName = String(suggestedName || 'TradeHelp-report.png').replace(/[^a-z0-9._-]/gi, '-')
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: safeName,
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try { writeFileSync(filePath, Buffer.from(match[1], 'base64')); return { ok: true, path: filePath } }
    catch (e) { return { ok: false, error: String(e?.message || e) } }
  })

  ipcMain.handle('images:list', (_e, tradeId) => db.listImages(tradeId))
  ipcMain.handle('images:get', (_e, id) => db.getImage(id))
  ipcMain.handle('images:add', (_e, tradeId, img) => db.addImage(tradeId, img))
  ipcMain.handle('images:delete', (_e, id) => db.deleteImage(id))
  ipcMain.handle('images:fingerprint', (_e, id, fingerprint, version) => db.updateImageFingerprint(id, fingerprint, version))

  ipcMain.handle('videos:pick', async (event) => {
    purgeExpiredVideoPicks()
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Screen recordings', extensions: ['mp4', 'webm', 'mov', 'm4v'] }]
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    if (filePaths.length > MAX_VIDEO_PICKS) return { ok: false, error: `Choose no more than ${MAX_VIDEO_PICKS} recordings at once.` }
    try {
      const inspected = filePaths.map((filePath) => db.inspectTradeVideoSource(filePath))
      const files = inspected.map((video) => {
        const token = randomUUID()
        pendingVideoPicks.set(token, {
          ownerId: event.sender.id,
          sourcePath: video.sourcePath,
          originalName: video.originalName,
          expiresAt: Date.now() + VIDEO_PICK_TTL_MS
        })
        return { token, name: video.originalName, mimeType: video.mimeType, size: video.size }
      })
      return { ok: true, files }
    } catch (error) {
      return { ok: false, error: safeVideoError(error, 'The selected recording could not be read.') }
    }
  })
  ipcMain.handle('videos:discardPicked', (event, tokens) => {
    for (const token of new Set(Array.isArray(tokens) ? tokens.map(String) : [])) {
      const picked = pendingVideoPicks.get(token)
      if (picked?.ownerId === event.sender.id) pendingVideoPicks.delete(token)
    }
    return { ok: true }
  })
  ipcMain.handle('videos:addPicked', (event, tradeId, tokens) => {
    purgeExpiredVideoPicks()
    const selected = [...new Set(Array.isArray(tokens) ? tokens.map(String) : [])]
    const errors = []
    if (selected.length > MAX_VIDEO_PICKS) {
      return { ok: false, videos: publicVideos(db.listTradeVideos(tradeId)), errors: [`Attach no more than ${MAX_VIDEO_PICKS} recordings at once.`] }
    }
    for (const token of selected) {
      const picked = pendingVideoPicks.get(token)
      if (!picked || picked.ownerId !== event.sender.id) {
        errors.push('A selected recording expired. Choose it again.')
        continue
      }
      pendingVideoPicks.delete(token)
      try {
        db.addTradeVideoFromPath(tradeId, picked.sourcePath)
      } catch (error) {
        errors.push(`${picked.originalName}: ${safeVideoError(error, 'The recording could not be copied into TradeHelp.')}`)
      }
    }
    return { ok: errors.length === 0, videos: publicVideos(db.listTradeVideos(tradeId)), errors }
  })
  ipcMain.handle('videos:list', (_event, tradeId) => publicVideos(db.listTradeVideos(tradeId)))
  ipcMain.handle('videos:delete', (_event, id) => publicVideos(db.deleteTradeVideo(id)))

  ipcMain.handle('plans:list', () => db.listTradePlans())
  ipcMain.handle('plans:add', (_e, plan) => db.addTradePlan(plan))
  ipcMain.handle('plans:update', (_e, plan) => db.updateTradePlan(plan))
  ipcMain.handle('plans:delete', (_e, id) => db.deleteTradePlan(id))
  ipcMain.handle('plans:screenshot', (_e, id) => db.getTradePlanScreenshot(id))

  ipcMain.handle('commitments:list', () => db.listCoachCommitments())
  ipcMain.handle('commitments:add', (_e, commitment) => db.addCoachCommitment(commitment))
  ipcMain.handle('commitments:update', (_e, commitment) => db.updateCoachCommitment(commitment))
  ipcMain.handle('commitments:delete', (_e, id) => db.deleteCoachCommitment(id))

  ipcMain.handle('goals:get', () => db.getGoals())
  ipcMain.handle('goals:set', (_e, g) => db.setGoals(g))

  ipcMain.handle('reviews:get', () => db.getReviews())
  ipcMain.handle('reviews:set', (_e, period, text) => db.setReview(period, text))

  ipcMain.handle('playbook:list', () => db.listPlaybook())
  ipcMain.handle('playbook:add', (_e, entry) => db.addPlaybookEntry(entry))
  ipcMain.handle('playbook:update', (_e, entry) => db.updatePlaybookEntry(entry))
  ipcMain.handle('playbook:delete', (_e, id) => db.deletePlaybookEntry(id))

  ipcMain.handle('daylog:list', () => db.listDayLogs())
  ipcMain.handle('daylog:add', (_e, entry) => db.addDayLog(entry))
  ipcMain.handle('daylog:delete', (_e, id) => db.deleteDayLog(id))

  ipcMain.handle('payout:list', () => db.listPayouts())
  ipcMain.handle('payout:add', (_e, entry) => db.addPayout(entry))
  ipcMain.handle('payout:delete', (_e, id) => db.deletePayout(id))

  ipcMain.handle('license:status', () => license.status(db))
  ipcMain.handle('license:activate', (_e, key) => license.activate(db, key))
  ipcMain.handle('license:deactivate', () => license.deactivate(db))
  ipcMain.handle('app:openExternal', (_e, url) => {
    const s = String(url)
    if (/^https?:\/\//i.test(s)) shell.openExternal(s)
  })
  ipcMain.handle('key:test', (_e, payload) => testKey(payload))
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('release:notes', async () => {
    const v = app.getVersion()
    try {
      const r = await fetch(`https://api.github.com/repos/RaheimSwaby/tradehelp/releases/tags/v${v}`, { headers: { Accept: 'application/vnd.github+json' } })
      if (!r.ok) return { version: v, notes: '' }
      const d = await r.json()
      return { version: v, notes: String(d.body || '') }
    } catch { return { version: v, notes: '' } }
  })
  // Latest published version + platform, for the in-app "update available" nudge
  // (mainly for macOS, where the unsigned build can't auto-update).
  ipcMain.handle('update:latest', async () => {
    const platform = process.platform
    try {
      const r = await fetch('https://api.github.com/repos/RaheimSwaby/tradehelp/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      if (!r.ok) return { platform }
      const d = await r.json()
      const assets = d.assets || []
      const dmg = assets.find((a) => a.name?.endsWith('.dmg'))
      const exe = assets.find((a) => a.name?.endsWith('.exe') && !a.name?.includes('blockmap'))
      return {
        platform,
        version: String(d.tag_name || '').replace(/^v/, ''),
        url: d.html_url || '',
        dmgUrl: dmg?.browser_download_url || '',
        exeUrl: exe?.browser_download_url || ''
      }
    } catch { return { platform } }
  })

  ipcMain.handle('settings:get', () => db.getSettings())
  ipcMain.handle('settings:set', (_e, s) => { const r = db.setSettings(s); settingsCache = r; return r })
  ipcMain.handle('appearance:background:choose', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true }
    try {
      const src = filePaths[0]
      const ext = extname(src).toLowerCase()
      if (!BG_MIME[ext]) return { ok: false, error: 'Use a PNG, JPG, JPEG, or WEBP image.' }
      if (statSync(src).size > 12_000_000) return { ok: false, error: 'Background image must be under 12 MB.' }
      const file = `custom-background${ext}`
      copyFileSync(src, join(appearanceDir(), file))
      const r = db.setSettings({ customBackgroundFile: file })
      settingsCache = r
      return { ok: true, settings: r }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })
  ipcMain.handle('appearance:background:get', (_e, file) => {
    try {
      const p = backgroundPath(file)
      if (!p || !existsSync(p)) return { ok: false }
      const ext = extname(p).toLowerCase()
      const mime = BG_MIME[ext] || 'image/png'
      return { ok: true, dataUrl: `data:${mime};base64,${readFileSync(p).toString('base64')}` }
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  })
  ipcMain.handle('appearance:background:clear', (_e, file) => {
    try {
      const p = backgroundPath(file)
      if (p && existsSync(p)) unlinkSync(p)
    } catch {}
    const r = db.setSettings({ customBackgroundFile: '' })
    settingsCache = r
    return { ok: true, settings: r }
  })

  ipcMain.handle('ai:chat', async (_e, payload) => {
    try {
      const text = await chat(cachedSettings(), payload)
      return { ok: true, text }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  ipcMain.on('ai:stream:start', async (e, { id, payload }) => {
    try {
      const text = await chatStream(cachedSettings(), payload, (delta) => {
        try { e.sender.send('ai:stream:chunk', { id, delta }) } catch {}
      })
      try { e.sender.send('ai:stream:end', { id, text }) } catch {}
    } catch (err) {
      try { e.sender.send('ai:stream:error', { id, error: String(err?.message || err) }) } catch {}
    }
  })

  ipcMain.handle('ai:models', async () => {
    try {
      return { ok: true, models: await models(cachedSettings()) }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  ipcMain.handle('price:get', async (_e, sym) => {
    try {
      return { ok: true, ...(await fetchPrice(sym, cachedSettings().finnhubKey)) }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  ipcMain.handle('price:batch', async (_e, symbols) => {
    try {
      return await fetchQuotes(symbols, cachedSettings().finnhubKey)
    } catch {
      return []
    }
  })

  ipcMain.handle('events:list', async () => {
    try {
      return await fetchEvents(cachedSettings())
    } catch {
      return []
    }
  })
}
