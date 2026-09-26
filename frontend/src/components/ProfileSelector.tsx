import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle } from 'lucide-react'
import { useProfiles } from '../hooks/useProfiles'
import { useAppContext } from '../context/AppContext'
import type { Profile } from '../types'

const EMOJI_OPTIONS = ['🧔','🌊','😊','🎉','🦋','🌈','🔥','⭐','🎸','🏄','🧘','🦊']

export default function ProfileSelector() {
  const navigate = useNavigate()
  const { setActiveProfile } = useAppContext()
  const { profiles, loading, error, createProfile } = useProfiles()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('😊')

  const handleSelect = (profile: Profile) => {
    setActiveProfile(profile)
    navigate('/accounts')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await createProfile({ name: name.trim(), emoji })
    setName('')
    setCreating(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Welcome</h1>
        <p className="text-slate-400">Who are you?</p>
      </div>

      {loading && <p className="text-slate-400">Loading profiles…</p>}
      {error && <p className="text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-4 justify-center">
        {profiles.map(profile => (
          <button
            key={profile.id}
            onClick={() => handleSelect(profile)}
            className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur transition-all hover:scale-105 cursor-pointer"
          >
            <span className="text-5xl">{profile.emoji}</span>
            <span className="text-white font-medium text-lg">{profile.name}</span>
          </button>
        ))}
      </div>

      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <PlusCircle size={18} />
          New profile
        </button>
      ) : (
        <form onSubmit={handleCreate} className="bg-white/10 border border-white/20 rounded-2xl p-6 backdrop-blur flex flex-col gap-4 w-80">
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map(e => (
              <button
                type="button"
                key={e}
                onClick={() => setEmoji(e)}
                className={`text-2xl p-1 rounded-lg transition-all ${emoji === e ? 'bg-white/30 scale-110' : 'hover:bg-white/10'}`}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            autoFocus
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-slate-400 outline-none focus:border-white/40"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={!name.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg py-2 font-medium transition-colors">
              Create
            </button>
            <button type="button" onClick={() => setCreating(false)}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white rounded-lg py-2 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
