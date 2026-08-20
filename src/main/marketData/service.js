import { computeDirectionalBias } from '../../renderer/src/directionalBias.js'
import { createDatabentoProvider, DATABENTO_ID } from './databento.js'
import { createOandaPracticeProvider } from './oanda.js'

export function createMarketDataService({ database, vault, fetchImpl, now = () => Date.now() } = {}) {
  if (!database || !vault) throw new Error('Market data service needs a database and credential vault')
  const providers = new Map()
  const databento = createDatabentoProvider({ fetchImpl, now })
  const oanda = createOandaPracticeProvider({ fetchImpl, now })
  providers.set(databento.id, databento)
  providers.set(oanda.id, oanda)

  function provider(id) {
    const match = providers.get(String(id || '').trim().toLowerCase())
    if (!match) throw new Error('Choose a supported market data provider')
    return match
  }

  function credential(id) {
    const value = vault.get(id)
    if (!value) throw new Error('Connect the market data provider first')
    return value
  }

  return {
    capabilities() {
      return [...providers.values()].map(({ id, label, dataset, mode, market, noCharge = false, capabilities, instruments }) => ({
        id, label, dataset, mode, market, noCharge, capabilities, instruments
      }))
    },

    status(id = DATABENTO_ID) {
      const match = provider(id)
      return { provider: match.id, label: match.label, dataset: match.dataset, ...vault.status(match.id) }
    },

    async connect({ provider: id = DATABENTO_ID, apiKey = '', token = '', credential = '' } = {}) {
      const match = provider(id)
      const secret = String(credential || apiKey || token || '').trim()
      const result = await match.test(secret)
      vault.set(match.id, secret)
      return {
        ...this.status(match.id),
        connected: true,
        availableThrough: result.availableThrough,
        accountCount: result.accountCount
      }
    },

    disconnect(id = DATABENTO_ID) {
      return { ...vault.delete(provider(id).id), provider: provider(id).id, connected: false }
    },

    async estimate({ provider: id = DATABENTO_ID, ...input } = {}) {
      const match = provider(id)
      return { provider: match.id, ...(await match.estimate(credential(match.id), input)) }
    },

    async sync({ provider: id = DATABENTO_ID, ...input } = {}) {
      const match = provider(id)
      const result = await match.getHistory(credential(match.id), input)
      const storeBars = typeof database.mergePriceBars === 'function' ? database.mergePriceBars.bind(database) : database.importPriceBars.bind(database)
      const stored = storeBars({
        root: result.instrument,
        label: result.symbol,
        contract: match.market === 'forex' ? 'spot' : 'volume front month',
        sourceFile: `${match.label} API`,
        bars: result.bars
      })
      return { provider: match.id, source: match.label, ...stored, bias: this.bias(result.instrument) }
    },

    async quote(instrument) {
      const root = String(instrument || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
      if (!oanda.instruments.includes(root)) throw new Error('Choose a supported OANDA forex pair')
      return oanda.getQuote(credential(oanda.id), { instrument: root })
    },

    bias(instrument) {
      const root = String(instrument || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
      const end = Math.floor(now() / 1000) + 60
      const bars = database.getPriceBars(root, end - 10 * 86400, end)
      const series = database.listPriceSeries().find((item) => String(item.root).toUpperCase() === root)
      return computeDirectionalBias({ bars, instrument: root, source: series?.sourceFile || 'Local bars', now: now() })
    }
  }
}
