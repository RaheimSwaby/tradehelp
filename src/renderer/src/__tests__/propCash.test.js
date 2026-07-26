import { describe, expect, it } from 'vitest'
import { computePropCash } from '../propCash.js'

describe('computePropCash', () => {
  it('compares prop payouts against spending and excludes live withdrawals', () => {
    const result = computePropCash(
      [
        { accountId: 'prop-1', amount: 500 },
        { accountId: 'live', amount: 200 }
      ],
      [
        { accountId: 'prop-1', amount: 100 },
        { accountId: 'prop-1', amount: 50 }
      ]
    )

    expect(result.overall).toMatchObject({
      spent: 150,
      payouts: 500,
      net: 350
    })
    expect(result.overall.recovery).toBeCloseTo(333.333, 2)
    expect(result.overall.roi).toBeCloseTo(233.333, 2)
  })

  it('applies refunds as credits against gross spending', () => {
    const result = computePropCash(
      [{ accountId: 'prop-1', amount: 100 }],
      [
        { accountId: 'prop-1', amount: 80 },
        { accountId: 'prop-1', amount: -20 }
      ]
    )

    expect(result.overall).toMatchObject({
      grossSpend: 80,
      credits: 20,
      spent: 60,
      payouts: 100,
      net: 40
    })
  })

  it('keeps account totals separate and preserves deleted-account history', () => {
    const result = computePropCash(
      [{ accountId: 'deleted-account', amount: 250 }],
      [{ accountId: 'deleted-account', amount: 300 }]
    )

    expect(result.byAccount['deleted-account']).toMatchObject({
      spent: 300,
      payouts: 250,
      net: -50
    })
    expect(result.byAccount['missing']).toBeUndefined()
  })
})
