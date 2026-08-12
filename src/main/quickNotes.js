import { BrowserWindow, ipcMain, screen } from 'electron'

// A small always-on-top scratchpad for writing during a live session.
//
// The point of it is that it is hidden from screen capture: setContentProtection
// keeps it out of the session recording, so a candid mid-session note never ends up
// in a file you might share. That only works on Windows (WDA_EXCLUDEFROMCAPTURE,
// Win10 2004+) and macOS. Linux has no equivalent, and older Windows builds paint
// the window black in captures rather than omitting it, which would be worse than
// showing it. So the protection is applied defensively and its real state is
// reported back rather than assumed.

let win = null

const PAGE = `<!doctype html><meta charset="utf-8">
<style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body {
    margin: 0; height: 100vh; display: flex; flex-direction: column;
    font: 13px/1.45 "Segoe UI", system-ui, sans-serif;
    background: rgba(11,11,12,.92); color: #F0EDE6;
    border: 1px solid #26262A; border-radius: 8px; overflow: hidden;
  }
  header {
    -webkit-app-region: drag; user-select: none;
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px; border-bottom: 1px solid #26262A; background: #141417;
  }
  header b { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #8A857C }
  header .sp { margin-left: auto }
  button {
    -webkit-app-region: no-drag; cursor: pointer;
    border: 1px solid #26262A; border-radius: 4px; background: #1A1A1D; color: #C5C0B8;
    font: inherit; font-size: 11px; padding: 3px 9px;
  }
  button:hover { color: #F0EDE6 }
  textarea {
    -webkit-app-region: no-drag;
    flex: 1; resize: none; border: 0; outline: none; padding: 10px;
    background: transparent; color: #F0EDE6; font: inherit;
  }
  footer { padding: 5px 10px 7px; font-size: 10px; color: #8A857C; border-top: 1px solid #26262A }
</style>
<header>
  <b>Quick note</b>
  <span class="sp"></span>
  <button id="hide">Hide</button>
</header>
<textarea id="note" placeholder="Write while it is fresh. Stays out of the recording."></textarea>
<footer id="status">&nbsp;</footer>
<script>
  const { ipcRenderer } = require('electron')
  const ta = document.getElementById('note')
  const status = document.getElementById('status')
  ipcRenderer.invoke('quicknote:load').then((t) => { ta.value = t || '' })
  let timer = null
  ta.addEventListener('input', () => {
    clearTimeout(timer)
    status.textContent = 'Saving...'
    timer = setTimeout(async () => {
      await ipcRenderer.invoke('quicknote:save', ta.value)
      status.textContent = 'Saved ' + new Date().toLocaleTimeString()
    }, 400)
  })
  document.getElementById('hide').addEventListener('click', () => ipcRenderer.invoke('quicknote:close'))
</script>`

export function registerQuickNotes({ getNote, setNote }) {
  ipcMain.handle('quicknote:load', () => getNote())
  ipcMain.handle('quicknote:save', (_e, text) => { setNote(String(text || '').slice(0, 20000)); return { ok: true } })
  ipcMain.handle('quicknote:close', () => { if (win && !win.isDestroyed()) win.close(); return { ok: true } })

  ipcMain.handle('quicknote:toggle', () => {
    if (win && !win.isDestroyed()) {
      win.close()
      return { open: false, hiddenFromCapture: false }
    }
    // Park it top-right of the work area rather than centre screen, where it would
    // sit over the chart the trader is watching.
    const area = screen.getPrimaryDisplay().workArea
    const w = 300
    const h = 240
    win = new BrowserWindow({
      width: w,
      height: h,
      x: area.x + area.width - w - 24,
      y: area.y + 24,
      frame: false,
      transparent: true,
      resizable: true,
      minWidth: 220,
      minHeight: 160,
      alwaysOnTop: true,
      skipTaskbar: true,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    })
    // Float above full-screen apps too, which is where a charting platform usually is.
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    let hiddenFromCapture = false
    try {
      win.setContentProtection(true)
      hiddenFromCapture = process.platform === 'win32' || process.platform === 'darwin'
    } catch {
      hiddenFromCapture = false
    }

    win.on('closed', () => { win = null })
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE))
    return { open: true, hiddenFromCapture }
  })
}

export function closeQuickNotes() {
  if (win && !win.isDestroyed()) win.close()
  win = null
}
