import { Pencil, Copy, Trash2, ArrowRight } from 'lucide-react'
import type { Transaction, Profile, Currency } from '../types'

const TYPE_ICONS: Record<string, string> = {
  refill:     '💰',
  expense:    '🧾',
  income:     '📈',
  settlement: '↔',
}

interface Props {
  transaction: Transaction
  profiles:    Profile[]
  currency:    Currency
  onEdit:      (txn: Transaction) => void
  onDuplicate: (txn: Transaction) => void
  onDelete:    (txnId: string) => void
}

export default function TransactionItem({ transaction, profiles, currency, onEdit, onDuplicate, onDelete }: Props) {
  const isSettlement = transaction.type === 'settlement'

  // ── Settlement row ────────────────────────────────────────────────────────
  if (isSettlement) {
    const from = profiles.find(p => p.id === transaction.settlement_from)
    const to   = profiles.find(p => p.id === transaction.settlement_to)
    const amtStr = transaction.amount.toLocaleString('nb-NO', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }) + ' ' + (currency === 'NOK' ? 'kr' : currency)

    return (
      <div className="group flex items-center justify-between gap-4 p-4 rounded-xl
                      bg-violet-500/[0.05] hover:bg-violet-500/[0.09] border border-violet-500/[0.10]
                      transition-colors">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-2xl select-none">↔</span>
          <div className="flex-1 min-w-0">
            {/* Description (if any) + from → to */}
            <div className="flex items-center gap-1.5 text-sm font-medium text-white min-w-0 flex-wrap">
              {transaction.description && (
                <span className="truncate">{transaction.description}</span>
              )}
              {transaction.description && (
                <span className="text-slate-500 shrink-0">·</span>
              )}
              {from ? (
                <><span className="shrink-0">{from.emoji}</span><span className="shrink-0">{from.name}</span></>
              ) : (
                <span className="text-slate-500 shrink-0">?</span>
              )}
              <ArrowRight size={12} className="text-slate-500 shrink-0" />
              {to ? (
                <><span className="shrink-0">{to.emoji}</span><span className="shrink-0">{to.name}</span></>
              ) : (
                <span className="text-slate-500 shrink-0">?</span>
              )}
            </div>
            <p className="text-slate-400 text-sm">{transaction.date}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-violet-400">{amtStr}</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(transaction)} title="Edit"
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
              <Pencil size={14} />
            </button>
            <button onClick={() => onDelete(transaction.id)} title="Delete"
              className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Standard row ──────────────────────────────────────────────────────────
  const creator    = profiles.find(p => p.id === transaction.created_by)
  const amountColor = transaction.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
  const amountStr   = `${transaction.amount >= 0 ? '+' : ''}${transaction.amount.toLocaleString('nb-NO', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} ${currency === 'NOK' ? 'kr' : currency}`

  return (
    <div className="group flex items-center justify-between gap-4 p-4 rounded-xl
                    bg-white/5 hover:bg-white/10 border border-white/5 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-2xl">{TYPE_ICONS[transaction.type]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium truncate">{transaction.description}</p>
          <p className="text-slate-400 text-sm">
            {transaction.date}{creator ? ` · ${creator.emoji}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-mono font-semibold ${amountColor}`}>{amountStr}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(transaction)} title="Edit"
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDuplicate(transaction)} title="Duplicate"
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-indigo-400 transition-colors">
            <Copy size={14} />
          </button>
          <button onClick={() => onDelete(transaction.id)} title="Delete"
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
