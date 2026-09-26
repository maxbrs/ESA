import {
  createContext, useContext, useState, useCallback, useEffect, type ReactNode,
} from 'react'
import { api } from '../api/client'
import type {
  Profile, ProfileCreate, ProfileUpdate,
  Account, AccountCreate, AccountUpdate,
} from '../types'

// ── localStorage persistence for the account overview cache ──────────────────

const STORAGE_KEY  = 'tbd:overview-cache'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000   // 24 hours

interface StoredOverviewCache {
  netBalance:    Record<string, number>
  latestTxnDate: Record<string, string>
  cachedAt:      number
}

function loadFromStorage(): { netBalance: Record<string, number>; latestTxnDate: Record<string, string> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { netBalance: {}, latestTxnDate: {} }
    const parsed: StoredOverviewCache = JSON.parse(raw)
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return { netBalance: {}, latestTxnDate: {} }
    }
    return {
      netBalance:    parsed.netBalance    ?? {},
      latestTxnDate: parsed.latestTxnDate ?? {},
    }
  } catch {
    return { netBalance: {}, latestTxnDate: {} }
  }
}

function saveToStorage(
  netBalance:    Record<string, number>,
  latestTxnDate: Record<string, string>,
): void {
  try {
    const data: StoredOverviewCache = { netBalance, latestTxnDate, cachedAt: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded, etc.)
  }
}

// ── Context type ──────────────────────────────────────────────────────────────

interface AppContextType {
  activeProfile:    Profile | null
  setActiveProfile: (profile: Profile | null) => void

  // ── Profiles (fetched once here; hooks are thin wrappers) ──
  profiles:        Profile[]
  profilesLoading: boolean
  createProfile:   (data: ProfileCreate) => Promise<Profile>
  updateProfile:   (id: string, data: ProfileUpdate) => Promise<Profile>
  deleteProfile:   (id: string) => Promise<void>
  reloadProfiles:  () => Promise<void>

  // ── Accounts (fetched once here; hooks are thin wrappers) ──
  accounts:        Account[]
  accountsLoading: boolean
  createAccount:   (data: AccountCreate) => Promise<Account>
  updateAccount:   (id: string, data: AccountUpdate) => Promise<Account>
  deleteAccount:   (id: string) => Promise<void>
  reloadAccounts:  () => Promise<void>

  // ── Account overview cache (persisted to localStorage) ──
  netBalanceCache:       Record<string, number>
  setCachedNetBalance:   (accountId: string, net: number) => void
  latestTxnDateCache:    Record<string, string>
  setCachedLatestTxnDate:(accountId: string, date: string) => void
}

const AppContext = createContext<AppContextType | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)

  // ── Profiles ──────────────────────────────────────────────────────────────
  const [profiles,        setProfiles]        = useState<Profile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)

  const reloadProfiles = useCallback(async () => {
    setProfilesLoading(true)
    try { setProfiles(await api.getProfiles()) }
    finally { setProfilesLoading(false) }
  }, [])

  useEffect(() => { reloadProfiles() }, [reloadProfiles])

  const createProfile = useCallback(async (data: ProfileCreate) => {
    const created = await api.createProfile(data)
    setProfiles(prev => [...prev, created])
    return created
  }, [])

  const updateProfile = useCallback(async (id: string, data: ProfileUpdate) => {
    const updated = await api.updateProfile(id, data)
    setProfiles(prev => prev.map(p => p.id === id ? updated : p))
    return updated
  }, [])

  const deleteProfile = useCallback(async (id: string) => {
    await api.deleteProfile(id)
    setProfiles(prev => prev.filter(p => p.id !== id))
  }, [])

  // ── Accounts ──────────────────────────────────────────────────────────────
  const [accounts,        setAccounts]        = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)

  const reloadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try { setAccounts(await api.getAccounts()) }
    finally { setAccountsLoading(false) }
  }, [])

  useEffect(() => { reloadAccounts() }, [reloadAccounts])

  const createAccount = useCallback(async (data: AccountCreate) => {
    const created = await api.createAccount(data)
    setAccounts(prev => [...prev, created])
    return created
  }, [])

  const updateAccount = useCallback(async (id: string, data: AccountUpdate) => {
    const updated = await api.updateAccount(id, data)
    setAccounts(prev => prev.map(a => a.id === id ? updated : a))
    return updated
  }, [])

  const deleteAccount = useCallback(async (id: string) => {
    await api.deleteAccount(id)
    setAccounts(prev => prev.filter(a => a.id !== id))
  }, [])

  // ── Overview cache (localStorage-persisted) ───────────────────────────────
  const [netBalanceCache, setNetBalanceCache] = useState<Record<string, number>>(
    () => loadFromStorage().netBalance,
  )
  const [latestTxnDateCache, setLatestTxnDateCache] = useState<Record<string, string>>(
    () => loadFromStorage().latestTxnDate,
  )

  useEffect(() => {
    saveToStorage(netBalanceCache, latestTxnDateCache)
  }, [netBalanceCache, latestTxnDateCache])

  const setCachedNetBalance = useCallback((accountId: string, net: number) => {
    setNetBalanceCache(prev => prev[accountId] === net ? prev : { ...prev, [accountId]: net })
  }, [])

  const setCachedLatestTxnDate = useCallback((accountId: string, date: string) => {
    setLatestTxnDateCache(prev => prev[accountId] === date ? prev : { ...prev, [accountId]: date })
  }, [])

  return (
    <AppContext.Provider value={{
      activeProfile, setActiveProfile,
      profiles, profilesLoading, createProfile, updateProfile, deleteProfile, reloadProfiles,
      accounts, accountsLoading, createAccount, updateAccount, deleteAccount, reloadAccounts,
      netBalanceCache, setCachedNetBalance,
      latestTxnDateCache, setCachedLatestTxnDate,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
