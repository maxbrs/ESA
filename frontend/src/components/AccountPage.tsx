import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAccounts } from '../hooks/useAccounts'
import { useProfiles } from '../hooks/useProfiles'
import { useTransactions } from '../hooks/useTransactions'
import { useAppContext } from '../context/AppContext'
import { computeBalance } from '../utils/balance'
import AccountHeader from './AccountHeader'
import TransactionList from './TransactionList'
import BalancePanel from './BalancePanel'
import TransactionModal from './TransactionModal'
import SettingsModal from './SettingsModal'
import BatchImportModal from './BatchImportModal'
import type { Transaction } from '../types'

export default function AccountPage() {
  const { accountId } = useParams<{ accountId: string }>()
  const navigate = useNavigate()
  const { activeProfile, setCachedNetBalance, setCachedLatestTxnDate } = useAppContext()
  const { accounts, loading: accountsLoading, updateAccount } = useAccounts()
  const { profiles } = useProfiles()
  const { transactions, loading, createTransaction, updateTransaction, deleteTransaction, reload } = useTransactions(accountId!)

  const account = accounts.find(a => a.id === accountId)
  const [txnModal, setTxnModal] = useState<{ open: boolean; txn?: Transaction; template?: Transaction }>({ open: false })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [batchImportOpen, setBatchImportOpen] = useState(false)

  // ── Hooks must come before any early returns (Rules of Hooks) ──────────────
  const accountProfiles = useMemo(
    () => profiles.filter(p => account?.profile_weights[p.id] !== undefined),
    [profiles, account],
  )
  const balance = useMemo(
    () => computeBalance(transactions, accountProfiles),
    [transactions, accountProfiles],
  )
  const latestTxnDate = useMemo(
    () => transactions.reduce((max, t) => (t.date > max ? t.date : max), ''),
    [transactions],
  )

  // Keep the global caches up-to-date whenever transactions load.
  // No extra API call — pure arithmetic on already-fetched data.
  useEffect(() => {
    if (loading || !accountId || !account) return
    const net = Object.values(balance).reduce((s, v) => s + v, 0)
    setCachedNetBalance(accountId, net)
    setCachedLatestTxnDate(accountId, latestTxnDate)
  }, [balance, latestTxnDate, loading, accountId, account, setCachedNetBalance, setCachedLatestTxnDate])
  // ── End hooks ──────────────────────────────────────────────────────────────

  if (accountsLoading && !account) return (
    <div className="h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!account) return (
    <div className="p-8 text-slate-400">
      Account not found.{' '}
      <button onClick={() => navigate('/accounts')} className="text-indigo-400 underline">Go back</button>
    </div>
  )

  const handleDelete = async (txnId: string) => {
    if (!confirm('Delete this transaction?')) return
    await deleteTransaction(txnId)
  }

  return (
    <div className="h-screen flex flex-col" style={{ '--account-color': account.color } as React.CSSProperties}>
      <AccountHeader account={account} profiles={profiles} onSettings={() => setSettingsOpen(true)} />

      <div className="flex flex-1 gap-6 p-6 min-h-0">
        <TransactionList
          transactions={transactions}
          profiles={accountProfiles}
          currency={account.currency}
          loading={loading}
          onAdd={() => setTxnModal({ open: true })}
          onImport={() => setBatchImportOpen(true)}
          onEdit={txn => setTxnModal({ open: true, txn })}
          onDuplicate={txn => setTxnModal({ open: true, template: txn })}
          onDelete={handleDelete}
        />
        <BalancePanel profiles={accountProfiles} balance={balance} currency={account.currency} />
      </div>

      {txnModal.open && (
        <TransactionModal
          account={account}
          profiles={accountProfiles}
          activeProfile={activeProfile}
          transaction={txnModal.txn}
          template={txnModal.template}
          onSave={async (data) => {
            if (txnModal.txn) {
              await updateTransaction(txnModal.txn.id, data)
            } else {
              await createTransaction(data as any)
            }
            setTxnModal({ open: false })
          }}
          onClose={() => setTxnModal({ open: false })}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          account={account}
          profiles={profiles}
          onSave={async (data) => {
            await updateAccount(account.id, data)
            setSettingsOpen(false)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {batchImportOpen && (
        <BatchImportModal
          account={account}
          profiles={accountProfiles}
          existingTransactions={transactions}
          activeProfileId={activeProfile?.id ?? ''}
          onImported={() => { reload(); setBatchImportOpen(false) }}
          onClose={() => setBatchImportOpen(false)}
        />
      )}
    </div>
  )
}
