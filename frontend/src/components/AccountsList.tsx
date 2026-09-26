import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle, LogOut } from 'lucide-react'
import { useAccounts } from '../hooks/useAccounts'
import { useProfiles } from '../hooks/useProfiles'
import { useAppContext } from '../context/AppContext'
import AccountCard from './AccountCard'
import WeightsEditor from './WeightsEditor'
import type { AccountCreate, Currency } from '../types'

const PALETTE = ['#4A90D9','#E8A838','#7B68EE','#E74C3C','#2ECC71','#E91E8C','#16A085','#8E44AD']

export default function AccountsList() {
  const navigate = useNavigate()
  const { activeProfile, setActiveProfile, netBalanceCache, latestTxnDateCache } = useAppContext()
  const { accounts, loading, createAccount } = useAccounts()
  const { profiles } = useProfiles()
  const [showModal, setShowModal] = useState(false)

  // New account form state
  const [formName, setFormName] = useState('')
  const [formCurrency, setFormCurrency] = useState<Currency>('NOK')
  const [formColor, setFormColor] = useState(PALETTE[0])
  const [formProfileIds, setFormProfileIds] = useState<string[]>([])
  const [formWeights, setFormWeights] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const weightSum = Object.values(formWeights).reduce((s, v) => s + v, 0)
  const canSave = formName.trim() && formProfileIds.length >= 1 && Math.abs(weightSum - 1) < 0.001

  const toggleProfile = (id: string) => {
    setFormProfileIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      // Reset to even weights
      const even = next.length > 0 ? 1 / next.length : 0
      setFormWeights(Object.fromEntries(next.map(pid => [pid, parseFloat(even.toFixed(4))])))
      return next
    })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setSaveError(null)
    try {
      await createAccount({
        name: formName.trim(), currency: formCurrency,
        color: formColor, profile_weights: formWeights,
      } as AccountCreate)
      setShowModal(false)
      setFormName(''); setFormProfileIds([]); setFormWeights({})
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  // Group all cards (accounts + new-account button) into columns of 2 for the
  // horizontal-scroll grid: scroll right to reveal more columns.
  type CardItem = { kind: 'account'; account: (typeof accounts)[0] } | { kind: 'new' }
  const allItems: CardItem[] = [
    ...accounts.map(a => ({ kind: 'account' as const, account: a })),
    { kind: 'new' as const },
  ]
  // Pair items into columns
  const columns: CardItem[][] = []
  for (let i = 0; i < allItems.length; i += 2) columns.push(allItems.slice(i, i + 2))

  return (
    <div className="min-h-screen flex flex-col p-8">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {activeProfile ? `${activeProfile.emoji} ${activeProfile.name}` : 'Accounts'}
          </h1>
        </div>
        <button
          onClick={() => { setActiveProfile(null); navigate('/') }}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <LogOut size={14} /> Switch profile
        </button>
      </div>

      {/* ── Card grid: columns of 2, horizontal scroll ── */}
      <div className="flex-1 flex items-center">
        {loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : (
          <div className="flex gap-6 overflow-x-auto pb-2 -mx-8 px-8 w-full">
            {columns.map((col, colIdx) => (
              <div key={colIdx} className="flex flex-col gap-6 flex-shrink-0">
                {col.map((item, itemIdx) =>
                  item.kind === 'account' ? (
                    <AccountCard
                      key={item.account.id}
                      account={item.account}
                      profiles={profiles}
                      netBalance={netBalanceCache[item.account.id]}
                      latestTxnDate={latestTxnDateCache[item.account.id]}
                      onClick={() => navigate(`/accounts/${item.account.id}`)}
                    />
                  ) : (
                    <button
                      key="new"
                      onClick={() => setShowModal(true)}
                      className="w-80 h-[210px] rounded-2xl border border-white/10 bg-white/[0.04]
                                 hover:bg-white/[0.08] hover:border-white/20
                                 flex flex-col items-center justify-center gap-3
                                 text-slate-500 hover:text-slate-300 transition-all duration-300 group"
                    >
                      <div className="w-11 h-11 rounded-full border border-dashed border-white/20 group-hover:border-white/35
                                      flex items-center justify-center transition-colors">
                        <PlusCircle size={22} />
                      </div>
                      <span className="text-sm font-medium tracking-wide">New account</span>
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New account modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleCreate}
            className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-md flex flex-col gap-4"
          >
            <h2 className="text-xl font-bold text-white">New account</h2>

            <input
              autoFocus placeholder="Account name"
              value={formName} onChange={e => setFormName(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 outline-none focus:border-white/40"
            />

            <div className="flex gap-2">
              {(['NOK','USD','EUR'] as Currency[]).map(c => (
                <button type="button" key={c} onClick={() => setFormCurrency(c)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${formCurrency === c ? 'bg-indigo-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
                  {c}
                </button>
              ))}
            </div>

            <div>
              <p className="text-sm text-slate-400 mb-2">Color</p>
              <div className="flex gap-2 flex-wrap">
                {PALETTE.map(c => (
                  <button type="button" key={c} onClick={() => setFormColor(c)}
                    className={`w-8 h-8 rounded-full transition-transform ${formColor === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-slate-400 mb-2">Profiles</p>
              <div className="flex flex-wrap gap-2">
                {profiles.map(p => (
                  <button type="button" key={p.id} onClick={() => toggleProfile(p.id)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${formProfileIds.includes(p.id) ? 'bg-indigo-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
                    {p.emoji} {p.name}
                  </button>
                ))}
              </div>
            </div>

            {formProfileIds.length >= 1 && (
              <WeightsEditor
                profileIds={formProfileIds}
                profiles={profiles}
                weights={formWeights}
                onChange={setFormWeights}
              />
            )}

            {saveError && <p className="text-red-400 text-sm">{saveError}</p>}

            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={!canSave || saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg py-2 font-medium transition-colors">
                {saving ? 'Creating…' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowModal(false)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-lg py-2 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
