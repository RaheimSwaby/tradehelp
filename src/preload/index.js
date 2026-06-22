import { contextBridge, ipcRenderer } from 'electron'

const api = {
  listTrades: () => ipcRenderer.invoke('trades:list'),
  addTrade: (t) => ipcRenderer.invoke('trades:add', t),
  updateTrade: (t) => ipcRenderer.invoke('trades:update', t),
  importTrades: (rows) => ipcRenderer.invoke('trades:import', rows),
  deleteTrade: (id) => ipcRenderer.invoke('trades:delete', id),

  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),

  listImages: (tradeId) => ipcRenderer.invoke('images:list', tradeId),
  getImage: (id) => ipcRenderer.invoke('images:get', id),
  addImage: (tradeId, img) => ipcRenderer.invoke('images:add', tradeId, img),
  deleteImage: (id) => ipcRenderer.invoke('images:delete', id),

  getGoals: () => ipcRenderer.invoke('goals:get'),
  setGoals: (g) => ipcRenderer.invoke('goals:set', g),

  getReviews: () => ipcRenderer.invoke('reviews:get'),
  setReview: (period, text) => ipcRenderer.invoke('reviews:set', period, text),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),

  aiChat: (payload) => ipcRenderer.invoke('ai:chat', payload),
  aiChatStream: (payload, { onChunk, onDone, onError }) => {
    const id = Math.random().toString(36).slice(2)
    const onC = (_e, m) => { if (m.id === id) onChunk?.(m.delta) }
    const onE = (_e, m) => { if (m.id === id) { cleanup(); onDone?.(m.text) } }
    const onErr = (_e, m) => { if (m.id === id) { cleanup(); onError?.(m.error) } }
    function cleanup() {
      ipcRenderer.removeListener('ai:stream:chunk', onC)
      ipcRenderer.removeListener('ai:stream:end', onE)
      ipcRenderer.removeListener('ai:stream:error', onErr)
    }
    ipcRenderer.on('ai:stream:chunk', onC)
    ipcRenderer.on('ai:stream:end', onE)
    ipcRenderer.on('ai:stream:error', onErr)
    ipcRenderer.send('ai:stream:start', { id, payload })
    return cleanup
  },
  aiModels: () => ipcRenderer.invoke('ai:models'),

  price: (sym) => ipcRenderer.invoke('price:get', sym),
  priceBatch: (symbols) => ipcRenderer.invoke('price:batch', symbols),
  events: () => ipcRenderer.invoke('events:list'),

  onUpdateReady: (cb) => ipcRenderer.on('update:ready', () => cb()),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),

  getLicense: () => ipcRenderer.invoke('license:status'),
  activateLicense: (key) => ipcRenderer.invoke('license:activate', key),
  deactivateLicense: () => ipcRenderer.invoke('license:deactivate'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  testKey: (payload) => ipcRenderer.invoke('key:test', payload),
  appVersion: () => ipcRenderer.invoke('app:version'),
  releaseNotes: () => ipcRenderer.invoke('release:notes')
}

contextBridge.exposeInMainWorld('api', api)
