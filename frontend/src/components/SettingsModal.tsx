import { useState } from 'react'
import { X } from 'lucide-react'
import WeightsEditor from './WeightsEditor'
import type { Account, Profile, AccountUpdate } from '../types'

const PALETTE = ['#4A90D9','#E8A838','#7B68EE','#E74C3C','#2ECC71','#E91E8C','#16A085','#8E44AD']

interface Props {
  account: Account
  profiles: Profile[]
  onSave: (data: AccountUpdate) => Promise<void>
  onClose: () => void
}

export default function SettingsModal({ account, profiles, onSave, onClose }: Props) {
  const [name, setName] = useState(account.name)
  const [color, setColor] = useState(account.color)
  const [weights, setWeights] = useState<Record<string, number>>({ ...account.profile_weights })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profileIds = Object.keys(account.profile_weights)
  const weightSum = Object.values(weights).reduce((s, v) => s + v, 0)
  const canSave = name.trim() && Math.abs(weightSum - 1) < 0.001

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), color, profile_weights: weights })
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
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Account settings</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <input
          placeholder="Account name" value={name} onChange={e => setName(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 outline-none focus:border-white/40"
        />

        <div>
          <p className="text-sm text-slate-400 mb-2">Color</p>
          <div className="flex gap-2 flex-wrap">
            {PALETTE.map(c => (
              <button type="button" key={c} onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        <WeightsEditor
          profileIds={profileIds}
          profiles={profiles}
          weights={weights}
          onChange={setWeights}
        />

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={!canSave || saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg py-2 font-medium transition-colors">
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
