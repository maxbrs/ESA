import type { Profile } from '../types'

interface Props {
  profileIds: string[]
  profiles: Profile[]
  weights: Record<string, number>
  defaultWeights?: Record<string, number>
  onChange: (weights: Record<string, number>) => void
}

export default function WeightsEditor({ profileIds, profiles, weights, defaultWeights, onChange }: Props) {
  const sum = profileIds.reduce((s, id) => s + (weights[id] ?? 0), 0)
  const valid = Math.abs(sum - 1) < 0.001

  const handleChange = (id: string, value: string) => {
    const num = parseFloat(value) || 0
    onChange({ ...weights, [id]: parseFloat(num.toFixed(4)) })
  }

  const distribute = () => {
    const even = parseFloat((1 / profileIds.length).toFixed(4))
    const updated: Record<string, number> = {}
    profileIds.forEach((id, i) => {
      updated[id] = i === profileIds.length - 1
        ? parseFloat((1 - even * (profileIds.length - 1)).toFixed(4))
        : even
    })
    onChange(updated)
  }

  const reset = () => {
    if (defaultWeights) onChange({ ...defaultWeights })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Distribution</p>
        <div className="flex items-center gap-3">
          {defaultWeights && (
            <button type="button" onClick={reset}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
              Reset
            </button>
          )}
          <button type="button" onClick={distribute}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            Even split
          </button>
        </div>
      </div>
      {profileIds.map(id => {
        const profile = profiles.find(p => p.id === id)
        return (
          <div key={id} className="flex items-center gap-3">
            <span className="text-lg w-8">{profile?.emoji}</span>
            <span className="text-white text-sm flex-1">{profile?.name}</span>
            <input
              type="number" min="0" max="1" step="0.0001"
              value={weights[id] ?? 0}
              onChange={e => handleChange(id, e.target.value)}
              className="w-24 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm text-right outline-none focus:border-white/40"
            />
          </div>
        )
      })}
      <p className={`text-xs text-right ${valid ? 'text-emerald-400' : 'text-red-400'}`}>
        Sum: {sum.toFixed(4)} <span>{valid ? '✓' : '≠ 1'}</span>
      </p>
    </div>
  )
}
