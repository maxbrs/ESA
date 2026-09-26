import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { ToolboxProvider } from './context/ToolboxContext'
import ProfileSelector from './components/ProfileSelector'
import AccountsList from './components/AccountsList'
import AccountPage from './components/AccountPage'
import Toolbox from './components/Toolbox'

// ── AuthGate ──────────────────────────────────────────────────────────────────
// On first load the gate probes /api/me without a token.
//   • 200  → backend has no API_SECRET (local dev) → skip gate entirely
//   • 401  → backend requires auth → show password prompt
// Once the user enters the correct code it is saved in localStorage and sent
// as a Bearer token on every subsequent request (see api/client.ts).
function AuthGate({ children }: { children: React.ReactNode }) {
  // 'checking' while we probe the backend; 'locked' means we need a password
  const [phase, setPhase] = useState<'checking' | 'locked' | 'open'>('checking')
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const stored = localStorage.getItem('tbd:api_secret') ?? ''
    const headers: Record<string, string> = stored
      ? { Authorization: `Bearer ${stored}` }
      : {}

    // /api/me is protected by the auth middleware. Without a token it returns
    // 401 when API_SECRET is configured, or 200 when auth is disabled (dev).
    fetch('/api/me', { headers })
      .then(r => {
        if (r.ok) {
          setPhase('open')
        } else {
          // 401 — either stored token is invalid or no token at all
          localStorage.removeItem('tbd:api_secret')
          setPhase('locked')
        }
      })
      .catch(() => {
        // Network error during check — optimistically let through
        setPhase('open')
      })
  }, [])

  useEffect(() => {
    if (phase === 'locked') inputRef.current?.focus()
  }, [phase])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || verifying) return
    setVerifying(true)
    setError('')

    fetch('/api/me', {
      headers: { Authorization: `Bearer ${input.trim()}` },
    })
      .then(r => {
        if (r.ok) {
          localStorage.setItem('tbd:api_secret', input.trim())
          setPhase('open')
        } else {
          setError('Wrong access code — try again.')
          setInput('')
          inputRef.current?.focus()
        }
      })
      .catch(() => {
        setError('Could not reach the server. Check your connection.')
      })
      .finally(() => setVerifying(false))
  }

  if (phase === 'checking') {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

  if (phase === 'locked') {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
        <div className="w-full max-w-xs">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🔐</div>
            <h1 className="text-white text-xl font-semibold tracking-tight">TBD</h1>
            <p className="text-neutral-400 text-sm mt-1">Enter your access code to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              ref={inputRef}
              type="password"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Access code"
              autoComplete="current-password"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3
                         text-white placeholder-neutral-500 text-sm outline-none
                         focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition"
            />

            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={!input.trim() || verifying}
              className="w-full bg-white text-neutral-900 font-medium text-sm rounded-xl py-3
                         hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {verifying ? 'Checking…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthGate>
      <AppProvider>
        <ToolboxProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ProfileSelector />} />
              <Route path="/accounts" element={<AccountsList />} />
              <Route path="/accounts/:accountId" element={<AccountPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

            {/* Floating toolbox — rendered outside <Routes> so it persists across navigation */}
            <Toolbox />
          </BrowserRouter>
        </ToolboxProvider>
      </AppProvider>
    </AuthGate>
  )
}
