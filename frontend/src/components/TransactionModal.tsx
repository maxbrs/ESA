import { useState, useEffect } from 'react'
import { X, ArrowRight } from 'lucide-react'
import WeightsEditor from './WeightsEditor'
import type { Account, Profile, Transaction, TransactionCreate, TransactionUpdate, TransactionType } from '../types'

interface Props {
  account:        Account
  profiles:       Profile[]
  activeProfile:  Profile | null
  transaction?:   Transaction   // editing an existing transaction
  template?:      Transaction   // duplicating — pre-fills fields but saves as new
  onSave:         (data: TransactionCreate | TransactionUpdate) => Promise<void>
  onClose:        () => void
}

const TYPES: { value: TransactionType; label: string; emoji: string; color: string }[] = [
  { value: 'refill',     label: 'Refill',   emoji: '💰', color: 'bg-emerald-600 hover:bg-emerald-500' },
  { value: 'expense',    label: 'Expense',  emoji: '🧾', color: 'bg-red-600 hover:bg-red-500'         },
  { value: 'income',     label: 'Income',   emoji: '📈', color: 'bg-blue-600 hover:bg-blue-500'       },
  { value: 'settlement', label: 'Settle',   emoji: '↔',  color: 'bg-violet-600 hover:bg-violet-500'  },
]

/** For a refill, weights are all-0 except the chosen profile = 1.0 */
function refillWeights(profileIds: string[], refillId: string): Record<string, number> {
  const w: Record<string, number> = {}
  profileIds.forEach(id => { w[id] = id === refillId ? 1 : 0 })
  return w
}

export default function TransactionModal({
  account, profiles, activeProfile, transaction, template, onSave, onClose,
}: Props) {
  const isEdit     = !!transaction
  const profileIds = Object.keys(account.profile_weights)

  // source: the transaction being edited or duplicated (for pre-filling)
  const source = transaction ?? template

  // Derive initial refill profile
  const initialRefillId = (() => {
    if (source?.type === 'refill') {
      return Object.entries(source.weights).find(([, v]) => v === 1)?.[0]
        ?? activeProfile?.id ?? profileIds[0]
    }
    return activeProfile?.id ?? profileIds[0]
  })()

  // Derive initial settlement profiles
  const initialSettlementFrom = source?.type === 'settlement'
    ? (source.settlement_from ?? profileIds[0])
    : (activeProfile?.id ?? profileIds[0])
  const initialSettlementTo   = source?.type === 'settlement'
    ? (source.settlement_to ?? profileIds.find(id => id !== initialSettlementFrom) ?? profileIds[0])
    : (profileIds.find(id => id !== (activeProfile?.id ?? profileIds[0])) ?? profileIds[0])

  const [type,             setType]             = useState<TransactionType>(source?.type ?? 'expense')
  const [description,      setDescription]      = useState(source?.description ?? '')
  const [amount,           setAmount]           = useState(source ? Math.abs(source.amount).toString() : '')
  const [date,             setDate]             = useState(transaction?.date ?? new Date().toISOString().slice(0, 10))
  const [refillProfileId,  setRefillProfileId]  = useState<string>(initialRefillId)
  const [settlementFrom,   setSettlementFrom]   = useState<string>(initialSettlementFrom)
  const [settlementTo,     setSettlementTo]     = useState<string>(initialSettlementTo)
  const [weights,          setWeights]          = useState<Record<string, number>>(
    source?.weights ?? (
      type === 'refill'
        ? refillWeights(profileIds, initialRefillId)
        : { ...account.profile_weights }
    )
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const weightSum    = Object.values(weights).reduce((s, v) => s + v, 0)
  const parsedAmount = parseFloat(amount)

  const canSave = type === 'settlement'
    ? parsedAmount > 0 && !!settlementFrom && !!settlementTo && settlementFrom !== settlementTo
    : (type === 'refill' || description.trim() !== '')
      && parsedAmount > 0
      && Math.abs(weightSum - 1) < 0.001

  // When type changes (create mode only): reset weights / settlement defaults
  useEffect(() => {
    if (isEdit) return
    if (type === 'refill') {
      setWeights(refillWeights(profileIds, refillProfileId))
    } else if (type === 'settlement') {
      // no weights needed
    } else {
      setWeights({ ...account.profile_weights })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, isEdit])

  // Keep settlementTo valid when settlementFrom changes
  useEffect(() => {
    if (settlementFrom === settlementTo) {
      const other = profileIds.find(id => id !== settlementFrom)
      if (other) setSettlementTo(other)
    }
  }, [settlementFrom, settlementTo, profileIds])

  const handleRefillProfile = (id: string) => {
    setRefillProfileId(id)
    setWeights(refillWeights(profileIds, id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        const data: TransactionUpdate = {
          type, description: description.trim(),
          amount: parsedAmount, date,
          weights: type === 'settlement' ? {} : weights,
          settlement_from: type === 'settlement' ? settlementFrom : undefined,
          settlement_to:   type === 'settlement' ? settlementTo   : undefined,
        }
        await onSave(data)
      } else {
        const data: TransactionCreate = {
          type, description: description.trim(),
          amount: parsedAmount, date,
          created_by: activeProfile?.id ?? '',
          weights: type === 'settlement' ? {} : weights,
          settlement_from: type === 'settlement' ? settlementFrom : undefined,
          settlement_to:   type === 'settlement' ? settlementTo   : undefined,
        }
        await onSave(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit}
        className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {isEdit ? 'Edit transaction' : template ? 'Duplicate transaction' : 'New transaction'}
          </h2>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Type selector — 2×2 grid to fit all four types */}
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(t => (
            <button type="button" key={t.value} onClick={() => setType(t.value)}
              className={`py-2 rounded-lg text-sm font-medium transition-colors flex items-center
                          justify-center gap-1.5
                          ${type === t.value
                            ? t.color + ' text-white'
                            : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
              <span>{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Description — optional for refill & settlement */}
        <input
          placeholder={
            type === 'refill'     ? 'Description (optional — auto-generated if blank)' :
            type === 'settlement' ? 'Note (optional — auto-generated if blank)' :
                                    'Description'
          }
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white
                     placeholder-slate-400 outline-none focus:border-white/40"
        />

        {/* Amount + date */}
        <div className="flex gap-3">
          <input
            type="number" min="0.01" step="0.01" placeholder="Amount"
            value={amount} onChange={e => setAmount(e.target.value)}
            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white
                       placeholder-slate-400 outline-none focus:border-white/40"
          />
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white
                       outline-none focus:border-white/40"
          />
        </div>

        {/* ── Settlement: bilateral profile picker ── */}
        {type === 'settlement' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {/* From (payer) */}
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1.5">Who pays</p>
                <div className="flex flex-col gap-1.5">
                  {profileIds.map(id => {
                    const p = profiles.find(pr => pr.id === id)
                    return (
                      <button type="button" key={id} onClick={() => setSettlementFrom(id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border
                                    text-sm transition-colors
                                    ${settlementFrom === id
                                      ? 'border-violet-400 bg-violet-400/20 text-white'
                                      : 'border-white/20 bg-white/10 text-slate-300 hover:bg-white/20'}`}>
                        <span>{p?.emoji}</span><span className="font-medium">{p?.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <ArrowRight size={18} className="text-slate-500 shrink-0 mt-5" />

              {/* To (receiver) */}
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1.5">Who receives</p>
                <div className="flex flex-col gap-1.5">
                  {profileIds.map(id => {
                    const p    = profiles.find(pr => pr.id === id)
                    const same = id === settlementFrom
                    return (
                      <button type="button" key={id} onClick={() => !same && setSettlementTo(id)}
                        disabled={same}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border
                                    text-sm transition-colors
                                    ${same
                                      ? 'border-white/10 bg-white/5 text-slate-600 cursor-not-allowed'
                                      : settlementTo === id
                                      ? 'border-violet-400 bg-violet-400/20 text-white'
                                      : 'border-white/20 bg-white/10 text-slate-300 hover:bg-white/20'}`}>
                        <span>{p?.emoji}</span><span className="font-medium">{p?.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Refill: profile picker ── */}
        {type === 'refill' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-400">Who's refilling?</p>
            <div className="flex gap-2 flex-wrap">
              {profileIds.map(id => {
                const p = profiles.find(pr => pr.id === id)
                return (
                  <button type="button" key={id} onClick={() => handleRefillProfile(id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors
                                ${refillProfileId === id
                                  ? 'border-emerald-400 bg-emerald-400/20 text-white'
                                  : 'border-white/20 bg-white/10 text-slate-300 hover:bg-white/20'}`}>
                    <span className="text-lg">{p?.emoji}</span>
                    <span className="text-sm font-medium">{p?.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Expense / Income: weights editor ── */}
        {(type === 'expense' || type === 'income') && (
          <WeightsEditor
            profileIds={profileIds}
            profiles={profiles}
            weights={weights}
            defaultWeights={account.profile_weights}
            onChange={setWeights}
          />
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={!canSave || saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white
                       rounded-lg py-2 font-medium transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-lg py-2 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
