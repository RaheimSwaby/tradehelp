function localDay(daysAgo) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - daysAgo)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function developmentBrokerSnapshot(lastCursor = '') {
  const catalog = [
    {
      externalId: 'dev-fill-001',
      trade: {
        symbol: 'MES', direction: 'Long', entry: 6312.25, exit: 6318.5, size: 1,
        pnl: 31.25, fees: 1.24, setup: 'Opening range', emotion: 'Focused',
        reason: 'Followed my plan', timestamp: `${localDay(4)} 09:38`,
        entryTime: '09:38', exitTime: '09:51',
        notes: 'Imported from the TradeHelp development broker.'
      }
    },
    {
      externalId: 'dev-fill-002',
      trade: {
        symbol: 'MNQ', direction: 'Short', entry: 23084.5, exit: 23104.25, size: 1,
        pnl: -39.5, fees: 1.24, setup: 'Failed breakout', emotion: 'Impatient',
        reason: 'Entered before confirmation', timestamp: `${localDay(3)} 10:12`,
        entryTime: '10:12', exitTime: '10:19',
        notes: 'Imported from the TradeHelp development broker.'
      }
    },
    {
      externalId: 'dev-fill-003',
      trade: {
        symbol: 'MES', direction: 'Short', entry: 6331.75, exit: 6322.5, size: 2,
        pnl: 92.5, fees: 2.48, setup: 'Liquidity sweep', emotion: 'Patient',
        reason: 'Waited for confirmation', timestamp: `${localDay(2)} 11:04`,
        entryTime: '11:04', exitTime: '11:27',
        notes: 'Imported from the TradeHelp development broker.'
      }
    },
    {
      externalId: 'dev-fill-004',
      trade: {
        symbol: 'NQ', direction: 'Long', entry: 23120.25, exit: 23136.75, size: 1,
        pnl: 330, fees: 2.58, setup: 'Trend pullback', emotion: 'Calm',
        reason: 'Managed according to plan', timestamp: `${localDay(1)} 09:47`,
        entryTime: '09:47', exitTime: '10:06',
        notes: 'Imported from the TradeHelp development broker.'
      }
    },
    {
      externalId: 'dev-fill-005',
      trade: {
        symbol: 'MES', direction: 'Long', entry: 6340.5, exit: 6336.25, size: 1,
        pnl: -21.25, fees: 1.24, setup: 'Support bounce', emotion: 'Neutral',
        reason: 'Setup invalidated', timestamp: `${localDay(0)} 10:31`,
        entryTime: '10:31', exitTime: '10:43',
        notes: 'Imported from the TradeHelp development broker.'
      }
    }
  ]
  const previous = Math.max(0, Math.min(catalog.length, Number.parseInt(lastCursor, 10) || 0))
  const available = previous === 0 ? 3 : Math.min(catalog.length, previous + 1)
  return { cursor: String(available), items: catalog.slice(0, available) }
}

export function createBrokerSync(database, { allowDevelopment = false } = {}) {
  const providers = allowDevelopment
    ? [{ key: 'development', label: 'Development simulator', mode: 'simulated' }]
    : []

  function requireProvider(provider) {
    const match = providers.find((item) => item.key === provider)
    if (!match) throw new Error('This broker provider is not available in this build')
    return match
  }

  return {
    capabilities() {
      return providers
    },

    list() {
      return database.listBrokerConnections()
    },

    connect(input = {}) {
      const provider = String(input.provider || '')
      requireProvider(provider)
      return database.saveBrokerConnection({
        id: input.id,
        provider,
        label: input.label || 'Development broker',
        account: input.account || ''
      })
    },

    disconnect(id) {
      return database.disconnectBrokerConnection(id)
    },

    reset(id) {
      const connection = database.getBrokerConnection(id)
      if (!connection) throw new Error('Broker connection not found')
      requireProvider(connection.provider)
      return database.resetBrokerConnectionData(id)
    },

    async sync(id) {
      const connection = database.getBrokerConnection(id)
      if (!connection) throw new Error('Broker connection not found')
      requireProvider(connection.provider)
      try {
        const snapshot = developmentBrokerSnapshot(connection.lastCursor)
        return database.importBrokerSyncItems(connection.id, snapshot.items, snapshot.cursor)
      } catch (error) {
        database.failBrokerConnectionSync(connection.id, error?.message || error)
        throw error
      }
    }
  }
}
