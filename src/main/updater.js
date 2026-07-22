import electronUpdater from 'electron-updater'
import { app, ipcMain } from 'electron'

const { autoUpdater } = electronUpdater

export function initUpdater(getWindow) {
  ipcMain.handle('update:install', () => { try { autoUpdater.quitAndInstall() } catch {} })
  ipcMain.handle('update:check', async () => { try { return await autoUpdater.checkForUpdates() } catch { return null } })

  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    getWindow()?.webContents.send('update:ready', { version: info.version })
  })

  autoUpdater.on('error', () => {})

  const check = () => autoUpdater.checkForUpdates().catch(() => {})

  check()
  // Poll every 30 minutes (plus on window focus). A short testing interval had been
  // left in, which made every install hammer the update feed and swamped the metrics.
  setInterval(check, 30 * 60 * 1000)
  app.on('browser-window-focus', () => check())
}
