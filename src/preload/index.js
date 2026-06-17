import { contextBridge, ipcRenderer } from 'electron'

const api = {
  listTrades: () => ipcRenderer.invoke('trades:list'),
  addTrade: (t) => ipcRenderer.invoke('trades:add', t),
  importTrades: (rows) => ipcRenderer.invoke('trades:import', rows),
  deleteTrade: (id) => ipcRenderer.invoke('trades:delete', id),

  listImages: (tradeId) => ipcRenderer.invoke('images:list', tradeId),
  addImage: (tradeId, img) => ipcRenderer.invoke('images:add', tradeId, img),
  deleteImage: (id) => ipcRenderer.invoke('images:delete', id),

  getGoals: () => ipcRenderer.invoke('goals:get'),
  setGoals: (g) => ipcRenderer.invoke('goals:set', g),

  getReviews: () => ipcRenderer.invoke('reviews:get'),
  setReview: (period, text) => ipcRenderer.invoke('reviews:set', period, text),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),

  aiChat: (payload) => ipcRenderer.invoke('ai:chat', payload),
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
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
}

contextBridge.exposeInMainWorld('api', api)
