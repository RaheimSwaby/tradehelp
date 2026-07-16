import { contextBridge, ipcRenderer } from 'electron'

const api = {
  listTrades: () => ipcRenderer.invoke('trades:list'),
  addTrade: (t) => ipcRenderer.invoke('trades:add', t),
  updateTrade: (t) => ipcRenderer.invoke('trades:update', t),
  importTrades: (rows) => ipcRenderer.invoke('trades:import', rows),
  deleteTrade: (id) => ipcRenderer.invoke('trades:delete', id),
  listTradeFills: (tradeId) => ipcRenderer.invoke('fills:list', tradeId),
  replaceTradeFills: (tradeId, fills) => ipcRenderer.invoke('fills:replace', tradeId, fills),

  listInstrumentProfiles: () => ipcRenderer.invoke('profiles:list'),
  addInstrumentProfile: (profile) => ipcRenderer.invoke('profiles:add', profile),
  updateInstrumentProfile: (profile) => ipcRenderer.invoke('profiles:update', profile),
  deleteInstrumentProfile: (id) => ipcRenderer.invoke('profiles:delete', id),

  listSavedSearches: () => ipcRenderer.invoke('searches:list'),
  addSavedSearch: (search) => ipcRenderer.invoke('searches:add', search),
  updateSavedSearch: (search) => ipcRenderer.invoke('searches:update', search),
  deleteSavedSearch: (id) => ipcRenderer.invoke('searches:delete', id),

  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),
  saveReportPng: (dataUrl, suggestedName) => ipcRenderer.invoke('report:savePng', dataUrl, suggestedName),

  listImages: (tradeId) => ipcRenderer.invoke('images:list', tradeId),
  getImage: (id) => ipcRenderer.invoke('images:get', id),
  addImage: (tradeId, img) => ipcRenderer.invoke('images:add', tradeId, img),
  deleteImage: (id) => ipcRenderer.invoke('images:delete', id),
  updateImageFingerprint: (id, fingerprint, version) => ipcRenderer.invoke('images:fingerprint', id, fingerprint, version),

  pickTradeVideos: () => ipcRenderer.invoke('videos:pick'),
  discardPickedTradeVideos: (tokens) => ipcRenderer.invoke('videos:discardPicked', tokens),
  addPickedTradeVideos: (tradeId, tokens) => ipcRenderer.invoke('videos:addPicked', tradeId, tokens),
  listTradeVideos: (tradeId) => ipcRenderer.invoke('videos:list', tradeId),
  deleteTradeVideo: (id) => ipcRenderer.invoke('videos:delete', id),

  listTradePlans: () => ipcRenderer.invoke('plans:list'),
  addTradePlan: (plan) => ipcRenderer.invoke('plans:add', plan),
  updateTradePlan: (plan) => ipcRenderer.invoke('plans:update', plan),
  deleteTradePlan: (id) => ipcRenderer.invoke('plans:delete', id),
  getTradePlanScreenshot: (id) => ipcRenderer.invoke('plans:screenshot', id),

  listCommitments: () => ipcRenderer.invoke('commitments:list'),
  addCommitment: (commitment) => ipcRenderer.invoke('commitments:add', commitment),
  updateCommitment: (commitment) => ipcRenderer.invoke('commitments:update', commitment),
  deleteCommitment: (id) => ipcRenderer.invoke('commitments:delete', id),

  getGoals: () => ipcRenderer.invoke('goals:get'),
  setGoals: (g) => ipcRenderer.invoke('goals:set', g),

  getReviews: () => ipcRenderer.invoke('reviews:get'),
  setReview: (period, text) => ipcRenderer.invoke('reviews:set', period, text),

  listPlaybook: () => ipcRenderer.invoke('playbook:list'),
  addPlaybookEntry: (e) => ipcRenderer.invoke('playbook:add', e),
  updatePlaybookEntry: (e) => ipcRenderer.invoke('playbook:update', e),
  deletePlaybookEntry: (id) => ipcRenderer.invoke('playbook:delete', id),

  listDayLogs: () => ipcRenderer.invoke('daylog:list'),
  addDayLog: (e) => ipcRenderer.invoke('daylog:add', e),
  deleteDayLog: (id) => ipcRenderer.invoke('daylog:delete', id),

  listPayouts: () => ipcRenderer.invoke('payout:list'),
  addPayout: (e) => ipcRenderer.invoke('payout:add', e),
  deletePayout: (id) => ipcRenderer.invoke('payout:delete', id),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  chooseBackground: () => ipcRenderer.invoke('appearance:background:choose'),
  getBackground: (file) => ipcRenderer.invoke('appearance:background:get', file),
  clearBackground: (file) => ipcRenderer.invoke('appearance:background:clear', file),

  aiChat: (payload) => ipcRenderer.invoke('ai:chat', payload),
  aiChatStream: (payload, { onChunk, onDone, onError }) => {
    const id = globalThis.crypto.randomUUID()
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

  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, info) => cb(info)),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (_e, info) => cb(info)),
  onUpdateReady: (cb) => ipcRenderer.on('update:ready', (_e, info) => cb(info)),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),

  getLicense: () => ipcRenderer.invoke('license:status'),
  activateLicense: (key) => ipcRenderer.invoke('license:activate', key),
  deactivateLicense: () => ipcRenderer.invoke('license:deactivate'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  testKey: (payload) => ipcRenderer.invoke('key:test', payload),
  appVersion: () => ipcRenderer.invoke('app:version'),
  releaseNotes: () => ipcRenderer.invoke('release:notes'),
  latestVersion: () => ipcRenderer.invoke('update:latest')
}

contextBridge.exposeInMainWorld('api', api)
