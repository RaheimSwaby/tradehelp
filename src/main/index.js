import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import * as db from './db.js'
import { chat, models } from './ai.js'
import { fetchPrice, fetchQuotes } from './price.js'
import { fetchEvents } from './events.js'
import { initUpdater } from './updater.js'

let win

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
  db.initDb()
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
  ipcMain.handle('trades:import', (_e, rows) => db.importTrades(rows))
  ipcMain.handle('trades:delete', (_e, id) => db.deleteTrade(id))

  ipcMain.handle('images:list', (_e, tradeId) => db.listImages(tradeId))
  ipcMain.handle('images:add', (_e, tradeId, img) => db.addImage(tradeId, img))
  ipcMain.handle('images:delete', (_e, id) => db.deleteImage(id))

  ipcMain.handle('goals:get', () => db.getGoals())
  ipcMain.handle('goals:set', (_e, g) => db.setGoals(g))

  ipcMain.handle('settings:get', () => db.getSettings())
  ipcMain.handle('settings:set', (_e, s) => db.setSettings(s))

  ipcMain.handle('ai:chat', async (_e, payload) => {
    try {
      const text = await chat(db.getSettings(), payload)
      return { ok: true, text }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  ipcMain.handle('ai:models', async () => {
    try {
      return { ok: true, models: await models(db.getSettings()) }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  ipcMain.handle('price:get', async (_e, sym) => {
    try {
      return { ok: true, ...(await fetchPrice(sym, db.getSettings().finnhubKey)) }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  ipcMain.handle('price:batch', async (_e, symbols) => {
    try {
      return await fetchQuotes(symbols, db.getSettings().finnhubKey)
    } catch {
      return []
    }
  })

  ipcMain.handle('events:list', async () => {
    try {
      return await fetchEvents(db.getSettings())
    } catch {
      return []
    }
  })
}
