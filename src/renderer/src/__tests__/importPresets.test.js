import { describe, expect, it } from 'vitest'
import { BROKER_PRESETS, detectBrokerPreset, applyPresetMap, parseCSV } from '../utils.js'

const presetByKey = (k) => BROKER_PRESETS.find((p) => p.key === k)

const NT_HEADERS = ['Trade number', 'Instrument', 'Account', 'Strategy', 'Market pos.', 'Qty', 'Entry price', 'Exit price', 'Entry time', 'Exit time', 'Entry name', 'Exit name', 'Profit', 'Cum. net profit', 'Commission', 'MAE', 'MFE', 'ETD', 'Bars']
const TDV_HEADERS = ['symbol', '_priceFormat', '_priceFormatType', '_tickSize', 'buyFillId', 'sellFillId', 'qty', 'buyPrice', 'sellPrice', 'pnl', 'boughtTimestamp', 'soldTimestamp', 'duration']
const TSX_HEADERS = ['Id', 'ContractName', 'EnteredAt', 'ExitedAt', 'EntryPrice', 'ExitPrice', 'Fees', 'PnL', 'Size', 'Type']
const NT_ORDERS_HEADERS = ['orderId', 'Account', 'Order ID', 'B/S', 'Contract', 'Product', 'avgPrice', 'filledQty', 'Fill Time', 'Status', 'Text', 'Type']

describe('broker preset detection', () => {
  it('recognizes a NinjaTrader 8 trade performance export', () => {
    expect(detectBrokerPreset(NT_HEADERS)?.key).toBe('ninjatrader')
  })
  it('recognizes a NinjaTrader Orders export', () => {
    expect(detectBrokerPreset(NT_ORDERS_HEADERS)?.key).toBe('ninjatrader-orders')
  })
  it('recognizes a Tradovate performance export', () => {
    expect(detectBrokerPreset(TDV_HEADERS)?.key).toBe('tradovate')
  })
  it('recognizes a TopstepX export', () => {
    expect(detectBrokerPreset(TSX_HEADERS)?.key).toBe('topstepx')
  })
  it('returns null for an unknown CSV', () => {
    expect(detectBrokerPreset(['Date', 'Ticker', 'Side', 'Amount'])).toBeNull()
  })
})

describe('NinjaTrader Orders preset', () => {
  it('rebuilds closed futures trades from filled order rows', () => {
    const csv = `orderId,Account,Order ID,B/S,Contract,Product,avgPrice,filledQty,Fill Time,Status,Text,Type
1,sim,1,Buy,MESH6,MES,6712.75,1,03/12/2026 10:00:24,Filled,multibracket,Market
2,sim,2,Sell,MESH6,MES,6714.75,1,03/12/2026 10:18:37,Filled,Exit,Market
3,sim,3,Sell,MESH6,MES,6709.75,1,03/16/2026 09:49:20,Filled,multibracket,Market
4,sim,4,Buy,MESH6,MES,6716.50,1,03/16/2026 09:57:04,Filled,Exit,Market
5,sim,5,Sell,MESH6,MES,6710.00,1,03/16/2026 10:00:00,Canceled,multibracket,Limit`
    const [headers, ...rows] = parseCSV(csv)
    const trades = presetByKey('ninjatrader-orders').buildRows(rows, headers, new Set())
    expect(trades).toHaveLength(2)
    expect(trades[0]).toMatchObject({
      symbol: 'MES',
      direction: 'Long',
      entry: 6712.75,
      exit: 6714.75,
      size: 1,
      pnl: 10,
      entryTime: '2026-03-12 10:00',
      exitTime: '2026-03-12 10:18'
    })
    expect(trades[1]).toMatchObject({
      symbol: 'MES',
      direction: 'Short',
      entry: 6709.75,
      exit: 6716.5,
      size: 1,
      pnl: -33.75,
      entryTime: '2026-03-16 09:49',
      exitTime: '2026-03-16 09:57'
    })
  })

  it('splits scale-ins when one exit closes multiple fills', () => {
    const csv = `orderId,Account,Order ID,B/S,Contract,Product,avgPrice,filledQty,Fill Time,Status,Text,Type
1,sim,1,Sell,MESM6,MES,6717.50,1,03/16/2026 10:04:12,Filled,multibracket,Market
2,sim,2,Sell,MESM6,MES,6717.50,1,03/16/2026 10:04:14,Filled,multibracket,Market
3,sim,3,Buy,MESM6,MES,6719.00,2,03/16/2026 10:07:03,Filled,Exit,Market`
    const [headers, ...rows] = parseCSV(csv)
    const trades = presetByKey('ninjatrader-orders').buildRows(rows, headers, new Set())
    expect(trades).toHaveLength(2)
    expect(trades.map((t) => t.pnl)).toEqual([-7.5, -7.5])
    expect(trades.every((t) => t.direction === 'Short' && t.size === 1)).toBe(true)
  })
})

describe('applyPresetMap', () => {
  it('resolves headers case-insensitively against the actual file', () => {
    const m = applyPresetMap(presetByKey('topstepx'), TSX_HEADERS.map((h) => h.toUpperCase()))
    expect(m.symbol).toBe('CONTRACTNAME')
    expect(m.entryTime).toBe('ENTEREDAT')
  })
  it('leaves missing headers empty instead of guessing', () => {
    const m = applyPresetMap(presetByKey('ninjatrader'), ['Instrument', 'Qty'])
    expect(m.symbol).toBe('Instrument')
    expect(m.pnl).toBe('')
  })
})

describe('preset post fixups', () => {
  it('NinjaTrader: trims the contract month off the instrument', () => {
    const t = { symbol: 'MNQ MAR24' }
    presetByKey('ninjatrader').post(t, () => '')
    expect(t.symbol).toBe('MNQ')
  })

  it('TopstepX: strips slash and F.US. prefixes from the contract name', () => {
    const a = { symbol: '/MNQH4' }
    presetByKey('topstepx').post(a, () => '')
    expect(a.symbol).toBe('MNQH4')
    const b = { symbol: 'F.US.MNQ.H24' }
    presetByKey('topstepx').post(b, () => '')
    expect(b.symbol).toBe('MNQ.H24')
  })

  it('Tradovate: infers Long when the buy fill came first, with prices oriented', () => {
    const row = { buyPrice: '20000.25', sellPrice: '20010.25', boughtTimestamp: '07/01/2025 09:30:00', soldTimestamp: '07/01/2025 09:45:00' }
    const t = {}
    presetByKey('tradovate').post(t, (k) => row[k] ?? '')
    expect(t.direction).toBe('Long')
    expect(t.entry).toBe(20000.25)
    expect(t.exit).toBe(20010.25)
    expect(t.entryTime).toBe('2025-07-01 09:30')
    expect(t.exitTime).toBe('2025-07-01 09:45')
    expect(t.timestamp).toBe('2025-07-01 09:30')
  })

  it('Tradovate: infers Short when the sell fill came first', () => {
    const row = { buyPrice: '19990.00', sellPrice: '20005.00', boughtTimestamp: '07/01/2025 10:15:00', soldTimestamp: '07/01/2025 10:00:00' }
    const t = {}
    presetByKey('tradovate').post(t, (k) => row[k] ?? '')
    expect(t.direction).toBe('Short')
    expect(t.entry).toBe(20005.00)
    expect(t.exit).toBe(19990.00)
    expect(t.entryTime).toBe('2025-07-01 10:00')
    expect(t.exitTime).toBe('2025-07-01 10:15')
  })
})
