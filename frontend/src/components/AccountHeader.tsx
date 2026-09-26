import { Home, ChevronLeft, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Account, Profile } from '../types'

interface Props {
  account: Account
  profiles: Profile[]
  onSettings: () => void
}

export default function AccountHeader({ account, profiles, onSettings }: Props) {
  const navigate = useNavigate()
  const accountProfiles = profiles.filter(p => account.profile_weights[p.id] !== undefined)

  return (
    <div className="flex items-center gap-4 py-4 px-6 border-b border-white/10">
      <button onClick={() => navigate('/')}
        className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
        <Home size={18} />
      </button>
      <button onClick={() => navigate('/accounts')}
        className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
        <ChevronLeft size={18} />
      </button>
      <h1 className="text-xl font-bold text-white flex-1">{account.name}</h1>
      <div className="flex items-center gap-1">
        {accountProfiles.map(p => (
          <span key={p.id} className="text-xl" title={p.name}>{p.emoji}</span>
        ))}
      </div>
      <button onClick={onSettings}
        className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
        <Settings size={18} />
      </button>
    </div>
  )
}
