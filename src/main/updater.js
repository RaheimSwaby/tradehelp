// Auto-updates via electron-updater, reading releases from GitHub (see build.publish in package.json).
// Only runs in the packaged/installed app — it's a no-op in `npm run dev`.
import electronUpdater from 'electron-updater'
import { app, ipcMain } from 'electron'

const { autoUpdater } = electronUpdater

export function initUpdater(getWindow) {
  // These IPC handlers are always registered so the renderer can call them safely in any mode.
  ipcMain.handle('update:install', () => { try { autoUpdater.quitAndInstall() } catch {} })
  ipcMain.handle('update:check', async () => { try { return await autoUpdater.checkForUpdates() } catch { return null } })

  if (!app.isPackaged) return // no published feed in dev

  autoUpdater.autoDownload = true
  autoUpdater.on('update-downloaded', () => getWindow()?.webContents.send('update:ready'))
  autoUpdater.on('error', () => { /* stay quiet; a failed update check shouldn't bother the user */ })

  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
}
