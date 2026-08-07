import { describe, it, expect } from 'vitest'
import { parseBarExport, parseBarTimestamp, selectBarsForTrade, barsCoverTrade } from '../utils/barImport.js'

describe('broker bar import', () => {
  // The format NinjaTrader 8 writes from Tools -> Historical Data -> Export.
  const NT8 = [
    '20260805 142900;5199.75;5200.50;5199.25;5200.00;842',
    '20260805 143000;5200.00;5201.25;5199.75;5200.75;1423',
    '20260805 143100;5200.75;5203.00;5200.50;5202.25;1190'
  ].join('\n')

  describe('timestamps', () => {
    // Verified against a real MES 09-26 export: the daily CME halt begins after
    // the 21:00 bar and the week opens Sunday 22:01, which is 16:00 and 17:00
    // Chicago. NinjaTrader writes UTC.
    it('reads NinjaTrader timestamps as UTC by default', () => {
      const t = parseBarTimestamp('20260805 143000')
      expect(new Date(t * 1000).toISOString()).toBe('2026-08-05T14:30:00.000Z')
    })

    // Reading UTC digits as local time parses cleanly and puts every candle
    // hours from the trade, so the wrong reading must not be the default.
    it('reads local wall clock only when asked', () => {
      const t = parseBarTimestamp('20260805 143000', 'local')
      const d = new Date(t * 1000)
      expect(d.getHours()).toBe(14)
      expect(d.getMinutes()).toBe(30)
    })

    it('produces different epochs for the two readings outside UTC', () => {
      const asUtc = parseBarTimestamp('20260805 143000', 'utc')
      const asLocal = parseBarTimestamp('20260805 143000', 'local')
      const offsetSeconds = new Date(2026, 7, 5, 14, 30).getTimezoneOffset() * 60
      expect(asLocal - asUtc).toBe(offsetSeconds)
    })

    it('reads a date-only row for daily bars', () => {
      const t = parseBarTimestamp('20260805')
      expect(new Date(t * 1000).toISOString().slice(0, 10)).toBe('2026-08-05')
    })

    it('reads ISO-style rows from other platforms', () => {
      expect(parseBarTimestamp('2026-08-05 14:30:00')).toBe(parseBarTimestamp('20260805 143000'))
    })

    it('rejects what it cannot parse instead of guessing', () => {
      expect(parseBarTimestamp('')).toBeNull()
      expect(parseBarTimestamp('not a date')).toBeNull()
    })
  })

  describe('parsing', () => {
    it('parses a NinjaTrader export', () => {
      const { bars, errors, delimiter, hasVolume } = parseBarExport(NT8)
      expect(errors).toEqual([])
      expect(delimiter).toBe(';')
      expect(hasVolume).toBe(true)
      expect(bars).toHaveLength(3)
      expect(bars[1]).toMatchObject({ open: 5200.0, high: 5201.25, low: 5199.75, close: 5200.75, volume: 1423 })
    })

    it('detects comma and tab delimited exports too', () => {
      expect(parseBarExport(NT8.replace(/;/g, ',')).bars).toHaveLength(3)
      expect(parseBarExport(NT8.replace(/;/g, '\t')).bars).toHaveLength(3)
    })

    it('skips an optional header row', () => {
      const withHeader = `Date;Open;High;Low;Close;Volume\n${NT8}`
      expect(parseBarExport(withHeader).bars).toHaveLength(3)
    })

    it('handles exports with no volume column', () => {
      const noVol = NT8.split('\n').map((l) => l.split(';').slice(0, 5).join(';')).join('\n')
      const { bars, hasVolume, errors } = parseBarExport(noVol)
      expect(errors).toEqual([])
      expect(hasVolume).toBe(false)
      expect(bars[0].volume).toBeUndefined()
    })

    // One bad row in a long export should not cost the trader the whole file.
    it('reports bad rows and keeps the good ones', () => {
      const dirty = `${NT8}\n20260805 143200;bad;5203;5200;5202;100\nnonsense line`
      const { bars, errors } = parseBarExport(dirty)
      expect(bars).toHaveLength(3)
      expect(errors).toHaveLength(2)
    })

    it('rejects bars whose high and low do not contain open and close', () => {
      const impossible = '20260805 143000;5200.00;5199.00;5198.00;5200.75;10'
      const { bars, errors } = parseBarExport(impossible)
      expect(bars).toHaveLength(0)
      expect(errors[0].reason).toMatch(/Impossible bar/)
    })

    it('sorts and de-duplicates so the chart series stays valid', () => {
      const outOfOrder = [
        '20260805 143100;5200.75;5203.00;5200.50;5202.25;1190',
        '20260805 142900;5199.75;5200.50;5199.25;5200.00;842',
        '20260805 142900;5199.75;5200.50;5199.25;5200.00;842'
      ].join('\n')
      const { bars, errors } = parseBarExport(outOfOrder)
      expect(bars.map((b) => b.time)).toEqual([...bars.map((b) => b.time)].sort((a, b) => a - b))
      expect(bars).toHaveLength(2)
      expect(errors.some((e) => /duplicate/.test(e.reason))).toBe(true)
    })

    it('returns an explanation for an empty file rather than throwing', () => {
      expect(parseBarExport('').errors[0].reason).toMatch(/empty/i)
      expect(parseBarExport(null).bars).toEqual([])
    })
  })

  // The import is not tied to the broker a trade was placed with — bars are
  // just market data, so any platform that can export OHLC will do.
  describe('other platforms', () => {
    const two = (rows) => rows.join('\n')

    it('reads MetaTrader dot-separated dates, comma or tab delimited', () => {
      const mt4 = two(['2026.08.05,14:30,5200.25,5202,5199.75,5201.5,1423', '2026.08.05,14:31,5201.5,5203,5201,5202.75,980'])
      const mt5 = two(['2026.08.05\t14:30:00\t5200.25\t5202\t5199.75\t5201.5\t1423', '2026.08.05\t14:31:00\t5201.5\t5203\t5201\t5202.75\t980'])
      expect(parseBarExport(mt4).bars).toHaveLength(2)
      expect(parseBarExport(mt5).bars).toHaveLength(2)
    })

    it('folds a separate date and time column back together', () => {
      const sierra = two([
        '2026/08/05, 14:30:00, 5200.25, 5202, 5199.75, 5201.5, 1423',
        '2026/08/05, 14:31:00, 5201.5, 5203, 5201, 5202.75, 980'
      ])
      const { bars, errors } = parseBarExport(sierra)
      expect(errors).toEqual([])
      expect(bars).toHaveLength(2)
      expect(bars[0].open).toBe(5200.25)
    })

    it('reads plain epoch timestamps in seconds and milliseconds', () => {
      expect(parseBarTimestamp('1785954600')).toBe(1785954600)
      expect(parseBarTimestamp('1785954600000')).toBe(1785954600)
    })

    // An explicit offset states the instant outright. Dropping it parsed every
    // row cleanly and placed each bar hours from the trade.
    it('honours an explicit UTC offset instead of assuming the source clock', () => {
      const withOffset = parseBarTimestamp('2026-08-05T14:30:00-04:00')
      expect(new Date(withOffset * 1000).toISOString()).toBe('2026-08-05T18:30:00.000Z')

      expect(parseBarTimestamp('2026-08-05T14:30:00Z')).toBe(parseBarTimestamp('20260805 143000'))
      expect(parseBarTimestamp('2026-08-05T14:30:00+02:00')).toBe(parseBarTimestamp('20260805 123000'))
    })

    it('parses a TradingView export end to end', () => {
      const tv = two([
        'time,open,high,low,close,Volume',
        '2026-08-05T14:30:00-04:00,5200.25,5202,5199.75,5201.5,1423',
        '2026-08-05T14:31:00-04:00,5201.5,5203,5201,5202.75,980'
      ])
      const { bars, errors } = parseBarExport(tv)
      expect(errors).toEqual([])
      expect(bars).toHaveLength(2)
      expect(new Date(bars[0].time * 1000).toISOString()).toBe('2026-08-05T18:30:00.000Z')
    })
  })

  describe('matching bars to a trade', () => {
    const { bars } = parseBarExport(NT8)
    const entry = bars[1].time
    const exit = bars[2].time

    it('narrows a long export to the window around the trade', () => {
      const selected = selectBarsForTrade(bars, entry, exit, 60)
      expect(selected.length).toBeGreaterThan(0)
      expect(selected.every((b) => b.time >= entry - 60 && b.time <= exit + 60)).toBe(true)
    })

    it('confirms when an import actually covers the trade', () => {
      expect(barsCoverTrade(bars, entry, exit)).toBe(true)
    })

    // An export for the wrong day or contract parses fine and still explains
    // nothing, so the chart must gate on coverage, not on parse success.
    it('reports no coverage when the export is for another day', () => {
      const elsewhere = entry + 86400 * 3
      expect(barsCoverTrade(bars, elsewhere, elsewhere + 600)).toBe(false)
      expect(barsCoverTrade([], entry, exit)).toBe(false)
    })
  })
})
