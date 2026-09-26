export type Currency = 'NOK' | 'USD' | 'EUR'
export type TransactionType = 'refill' | 'expense' | 'income' | 'settlement'

export interface Profile {
  id: string
  name: string
  emoji: string
  updated_at: string
}

export interface Account {
  id: string
  name: string
  currency: Currency
  color: string
  profile_weights: Record<string, number>
  updated_at: string
}

export interface Transaction {
  id: string
  type: TransactionType
  description: string
  amount: number              // signed: negative for expenses
  date: string                // YYYY-MM-DD
  created_by: string          // profile id
  weights: Record<string, number>
  settlement_from?: string    // settlements only: profile id of the payer
  settlement_to?: string      // settlements only: profile id of the receiver
  updated_at: string
}

// --- Note ---

export interface Note {
  id: string
  title: string
  content: string
  account_id: string | null
  created_at: string
  updated_at: string
}

export interface NoteCreate {
  title: string
  content?: string
  account_id?: string | null
}

export interface NoteUpdate {
  title?: string
  content?: string
  account_id?: string | null
}

// API request shapes
export interface ProfileCreate { name: string; emoji: string }
export interface ProfileUpdate { name: string; emoji: string }

export interface AccountCreate {
  name: string; currency: Currency; color: string
  profile_weights: Record<string, number>
}
export interface AccountUpdate {
  name?: string; color?: string; profile_weights?: Record<string, number>
}

export interface TransactionCreate {
  type: TransactionType; description: string
  amount: number              // always positive; backend applies sign
  date: string; created_by: string
  weights: Record<string, number>
  settlement_from?: string
  settlement_to?: string
}
export interface TransactionUpdate {
  type?: TransactionType; description?: string
  amount?: number             // always positive when provided
  date?: string; weights?: Record<string, number>
  settlement_from?: string
  settlement_to?: string
}
