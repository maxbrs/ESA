import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { Transaction, TransactionCreate, TransactionUpdate } from '../types'

/** Sort transactions: newest date first; ties broken by updated_at (full ISO timestamp). */
function byDateDesc(a: Transaction, b: Transaction): number {
  const dateCmp = b.date.localeCompare(a.date)
  if (dateCmp !== 0) return dateCmp
  return b.updated_at.localeCompare(a.updated_at)
}

export function useTransactions(accountId: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setTransactions((await api.getTransactions(accountId)).sort(byDateDesc))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => { load() }, [load])

  const createTransaction = async (data: TransactionCreate) => {
    const created = await api.createTransaction(accountId, data)
    setTransactions(prev => [created, ...prev].sort(byDateDesc))
    return created
  }

  const updateTransaction = async (txnId: string, data: TransactionUpdate) => {
    const updated = await api.updateTransaction(accountId, txnId, data)
    setTransactions(prev => prev.map(t => t.id === txnId ? updated : t).sort(byDateDesc))
    return updated
  }

  const deleteTransaction = async (txnId: string) => {
    await api.deleteTransaction(accountId, txnId)
    setTransactions(prev => prev.filter(t => t.id !== txnId))
  }

  return { transactions, loading, error, createTransaction, updateTransaction, deleteTransaction, reload: load }
}
