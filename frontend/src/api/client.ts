import type {
  Profile, ProfileCreate, ProfileUpdate,
  Account, AccountCreate, AccountUpdate,
  Transaction, TransactionCreate, TransactionUpdate,
  Note, NoteCreate, NoteUpdate,
} from '../types'

const BASE = '/api'

// ── Auth token ────────────────────────────────────────────────────────────────
// The token is stored in localStorage after the user enters it in the AuthGate.
// It is sent as a Bearer token on every API request.
function getToken(): string {
  return localStorage.getItem('tbd:api_secret') ?? ''
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const { headers: extraHeaders, ...rest } = options ?? {}

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(extraHeaders as Record<string, string> | undefined),
    },
  })

  // If the token is rejected mid-session, clear it and reload so the AuthGate
  // shows again. This handles cases like the secret rotating on the server.
  if (res.status === 401) {
    localStorage.removeItem('tbd:api_secret')
    window.location.reload()
    throw new Error('Unauthorized — please reload and enter your access code.')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  // Profiles
  getProfiles: () =>
    request<Profile[]>('/profiles'),
  createProfile: (data: ProfileCreate) =>
    request<Profile>('/profiles', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (id: string, data: ProfileUpdate) =>
    request<Profile>(`/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProfile: (id: string) =>
    request<void>(`/profiles/${id}`, { method: 'DELETE' }),

  // Accounts
  getAccounts: () =>
    request<Account[]>('/accounts'),
  createAccount: (data: AccountCreate) =>
    request<Account>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  getAccount: (id: string) =>
    request<Account>(`/accounts/${id}`),
  updateAccount: (id: string, data: AccountUpdate) =>
    request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id: string) =>
    request<void>(`/accounts/${id}`, { method: 'DELETE' }),

  // Transactions
  getTransactions: (accountId: string) =>
    request<Transaction[]>(`/accounts/${accountId}/transactions`),
  createTransaction: (accountId: string, data: TransactionCreate) =>
    request<Transaction>(`/accounts/${accountId}/transactions`, { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (accountId: string, txnId: string, data: TransactionUpdate) =>
    request<Transaction>(`/accounts/${accountId}/transactions/${txnId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (accountId: string, txnId: string) =>
    request<void>(`/accounts/${accountId}/transactions/${txnId}`, { method: 'DELETE' }),
  batchCreateTransactions: (accountId: string, transactions: TransactionCreate[]) =>
    request<Transaction[]>(`/accounts/${accountId}/transactions/batch`, {
      method: 'POST',
      body: JSON.stringify({ transactions }),
    }),

  // Notes
  getNotes: () =>
    request<Note[]>('/notes'),
  createNote: (data: NoteCreate) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify(data) }),
  updateNote: (id: string, data: NoteUpdate) =>
    request<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNote: (id: string) =>
    request<void>(`/notes/${id}`, { method: 'DELETE' }),
}
