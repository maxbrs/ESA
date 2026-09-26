import type { Profile, Currency } from '../types'
import { formatBalance } from '../utils/balance'

interface Props {
  profiles: Profile[]
  balance: Record<string, number>
  currency: Currency
}

export default function BalancePanel({ profiles, balance, currency }: Props) {
  const net = Object.values(balance).reduce((s, v) => s + v, 0)
  const netColor = net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-slate-400'

  return (
    <div className="w-64 shrink-0 bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Balance</h3>

      {profiles.map(profile => {
        const amount = balance[profile.id] ?? 0
        const color = amount > 0 ? 'text-emerald-400' : amount < 0 ? 'text-red-400' : 'text-slate-400'
        return (
          <div key={profile.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{profile.emoji}</span>
              <span className="text-white text-sm font-medium">{profile.name}</span>
            </div>
            <span className={`font-mono font-semibold text-sm ${color}`}>
              {formatBalance(amount, currency)}
            </span>
          </div>
        )
      })}

      {/* Net total */}
      <div className="border-t border-white/10 pt-3 flex items-center justify-between gap-2">
        <span className="text-slate-400 text-sm font-medium">Net</span>
        <span className={`font-mono font-bold text-sm ${netColor}`}>
          {formatBalance(net, currency)}
        </span>
      </div>
    </div>
  )
}
