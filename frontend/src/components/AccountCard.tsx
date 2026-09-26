import type { Account, Profile } from '../types'

interface Props {
  account: Account
  profiles: Profile[]
  netBalance?: number
  latestTxnDate?: string
  onClick: () => void
}

export default function AccountCard({ account, profiles, netBalance, latestTxnDate, onClick }: Props) {
  const accountProfiles = profiles.filter(p => account.profile_weights[p.id] !== undefined)
  const shown   = accountProfiles.slice(0, 4)
  const overflow = accountProfiles.length - 4

  const hasBalance = netBalance !== undefined
  const isNeg     = hasBalance && netBalance! < 0
  const absAmt    = hasBalance
    ? Math.abs(netBalance!).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null

  return (
    <button
      onClick={onClick}
      className="relative w-80 h-[210px] rounded-2xl p-5 flex flex-col justify-between text-white
                 shadow-xl hover:shadow-2xl hover:scale-[1.025] active:scale-[0.99]
                 transition-all duration-300 cursor-pointer overflow-hidden
                 border border-white/10 group"
      style={{
        background: `linear-gradient(140deg, ${account.color}f0 0%, ${account.color}b0 55%, ${account.color}70 100%)`,
      }}
    >
      {/* Gloss / shimmer layer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 40%, transparent 60%, rgba(255,255,255,0.04) 100%)',
        }}
      />
      {/* Subtle bottom-edge darkening for depth */}
      <div
        className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.2), transparent)' }}
      />

      {/* ── Top row: account name  |  balance ── */}
      <div className="relative flex items-start justify-between gap-3">
        <span className="font-bold text-[1.05rem] leading-snug text-white/95 text-left">
          {account.name}
        </span>

        <div className="text-right flex-shrink-0">
          {absAmt !== null ? (
            <>
              <div className={`font-mono font-bold text-xl leading-none tracking-tight ${isNeg ? 'text-red-200' : 'text-white'}`}>
                {isNeg ? '−' : '+'}{absAmt}
              </div>
              <div className="text-white/45 text-[0.65rem] font-semibold tracking-[0.15em] uppercase mt-1">
                {account.currency}
              </div>
            </>
          ) : (
            <div className="text-white/45 text-[0.65rem] font-semibold tracking-[0.15em] uppercase mt-0.5">
              {account.currency}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row: profile bubbles  |  last date ── */}
      <div className="relative flex items-end justify-between">

        {/* Overlapping profile circles */}
        <div className="flex items-center">
          {shown.map((p, i) => (
            <div
              key={p.id}
              title={p.name}
              className="w-9 h-9 rounded-full flex items-center justify-center text-lg
                         border-2 border-white/20 shadow-md select-none"
              style={{
                marginLeft: i > 0 ? '-10px' : '0',
                zIndex: shown.length - i,
                background: 'rgba(0,0,0,0.28)',
                backdropFilter: 'blur(4px)',
              }}
            >
              {p.emoji}
            </div>
          ))}
          {overflow > 0 && (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center
                         text-xs font-semibold text-white/60 border-2 border-white/15"
              style={{
                marginLeft: '-10px',
                zIndex: 0,
                background: 'rgba(0,0,0,0.40)',
                backdropFilter: 'blur(4px)',
              }}
            >
              +{overflow}
            </div>
          )}
        </div>

        {latestTxnDate && (
          <span className="text-white/35 text-[0.65rem] font-mono">
            {latestTxnDate}
          </span>
        )}
      </div>
    </button>
  )
}
