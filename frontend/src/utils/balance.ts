import type { Transaction, Profile, Currency } from '../types'

export function computeBalance(
  transactions: Transaction[],
  profiles: Profile[],
): Record<string, number> {
  // Initialise every profile to 0
  const balance: Record<string, number> = {}
  for (const profile of profiles) balance[profile.id] = 0

  for (const txn of transactions) {
    if (txn.type === 'settlement') {
      // Settlements are zero-sum: the payer's standing improves (+),
      // the receiver's credit decreases (−).  Net account balance is unchanged.
      if (txn.settlement_from && txn.settlement_from in balance)
        balance[txn.settlement_from] += txn.amount
      if (txn.settlement_to && txn.settlement_to in balance)
        balance[txn.settlement_to]   -= txn.amount
    } else {
      // Regular transactions: weighted split across profiles
      for (const profile of profiles)
        balance[profile.id] += txn.amount * (txn.weights[profile.id] ?? 0)
    }
  }

  return balance
}

export function formatBalance(amount: number, currency: Currency): string {
  const abs = Math.abs(amount).toLocaleString('nb-NO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).replace(/[\u00A0\u202F\u2009]/g, ' ')
  const sign   = amount >= 0 ? '+' : '-'
  const symbol = currency === 'NOK' ? 'kr' : currency === 'USD' ? '$' : '€'
  return `${sign}${abs} ${symbol}`
}
