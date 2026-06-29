import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync } from 'fs'
import * as db from './db.js'
import { chat, chatStream, models } from './ai.js'
import { fetchPrice, fetchQuotes } from './price.js'
import { fetchEvents } from './events.js'
import { initUpdater } from './updater.js'
import * as license from './license.js'
import { testKey } from './keytest.js'

let win
let settingsCache = null
function cachedSettings() {
  if (!settingsCache) settingsCache = db.getSettings()
  return settingsCache
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
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.tradehelp.app') // so Windows notifications show "TradeHelp", not "electron.app"
  db.initDb()
  db.backupDb()
  registerIpc()
  createWindow()
  initUpdater(() => win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
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
