import electronUpdater from 'electron-updater'
import { app, ipcMain } from 'electron'

const { autoUpdater } = electronUpdater

export function initUpdater(getWindow) {
  ipcMain.handle('update:install', () => { try { autoUpdater.quitAndInstall() } catch {} })
  ipcMain.handle('update:download', () => { try { autoUpdater.downloadUpdate() } catch {} })
  ipcMain.handle('update:check', async () => { try { return await autoUpdater.checkForUpdates() } catch { return null } })

  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    getWindow()?.webContents.send('update:available', { version: info.version })
  })

  autoUpdater.on('download-progress', (p) => {
    getWindow()?.webContents.send('update:progress', { percent: Math.round(p.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    getWindow()?.webContents.send('update:ready', { version: info.version })
  })

  autoUpdater.on('error', () => {})

  const check = () => autoUpdater.checkForUpdates().catch(() => {})

  check()
  setInterval(check, 30 * 60 * 1000)
  app.on('browser-window-focus', () => check())
}
