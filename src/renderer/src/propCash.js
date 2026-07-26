function amount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function emptyCash() {
  return { grossSpend: 0, credits: 0, spent: 0, payouts: 0, net: 0, recovery: null, roi: null }
}

function finishCash(cash) {
  cash.spent = cash.grossSpend - cash.credits
  cash.net = cash.payouts - cash.spent
  cash.recovery = cash.spent > 0 ? (cash.payouts / cash.spent) * 100 : null
  cash.roi = cash.spent > 0 ? (cash.net / cash.spent) * 100 : null
  return cash
}

export function computePropCash(payouts = [], expenses = []) {
  const overall = emptyCash()
  const byAccount = {}
  const account = (id) => {
    const key = String(id || '')
    if (!byAccount[key]) byAccount[key] = emptyCash()
    return byAccount[key]
  }

  for (const payout of payouts) {
    if (!payout?.accountId || payout.accountId === 'live') continue
    const value = amount(payout.amount)
    overall.payouts += value
    account(payout.accountId).payouts += value
  }

  for (const expense of expenses) {
    if (!expense?.accountId || expense.accountId === 'live') continue
    const value = amount(expense.amount)
    const target = account(expense.accountId)
    if (value >= 0) {
      overall.grossSpend += value
      target.grossSpend += value
    } else {
      overall.credits += Math.abs(value)
      target.credits += Math.abs(value)
    }
  }

  for (const value of Object.values(byAccount)) finishCash(value)
  return { overall: finishCash(overall), byAccount }
}
