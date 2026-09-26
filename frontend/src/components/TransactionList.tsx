import { useMemo, useState } from 'react'
import { SlidersHorizontal, PlusCircle, FileUp } from 'lucide-react'
import type { Transaction, Profile, Currency, TransactionType } from '../types'
import TransactionItem from './TransactionItem'
import TransactionFilters, { type TxnBounds } from './TransactionFilters'

interface Props {
  transactions: Transaction[]
  profiles:     Profile[]
  currency:     Currency
  loading:      boolean
  onAdd:        () => void
  onImport:     () => void
  onEdit:       (txn: Transaction) => void
  onDuplicate:  (txn: Transaction) => void
  onDelete:     (txnId: string) => void
}

export default function TransactionList({
  transactions, profiles, currency, loading,
  onAdd, onImport, onEdit, onDuplicate, onDelete,
}: Props) {

  // ── Bounds — recomputed whenever the transaction list changes ─────────────

  const bounds: TxnBounds | null = useMemo(() => {
    if (transactions.length === 0) return null
    let minDate = transactions[0].date, maxDate = transactions[0].date
    let minAmount = transactions[0].amount, maxAmount = transactions[0].amount
    for (const t of transactions) {
      if (t.date   < minDate)   minDate   = t.date
      if (t.date   > maxDate)   maxDate   = t.date
      if (t.amount < minAmount) minAmount = t.amount
      if (t.amount > maxAmount) maxAmount = t.amount
    }
    // Ensure the slider always has a non-zero range
    if (minAmount === maxAmount) { minAmount -= 1; maxAmount += 1 }
    return { minDate, maxDate, minAmount, maxAmount }
  }, [transactions])

  // ── Filter state ──────────────────────────────────────────────────────────
  // null  → not set by the user; the full range (from bounds) is used instead.
  // This means new transactions are always visible when no filter is active,
  // even if their amount/date falls outside the range that existed at load time.

  const [showFilters,   setShowFilters]   = useState(false)
  const [userDateFrom,  setUserDateFrom]  = useState<string | null>(null)
  const [userDateTo,    setUserDateTo]    = useState<string | null>(null)
  const [userAmountMin, setUserAmountMin] = useState<number | null>(null)
  const [userAmountMax, setUserAmountMax] = useState<number | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<Set<TransactionType>>(new Set())
  const [descSearch,    setDescSearch]    = useState('')

  // Effective values fall back to the live bounds when the user hasn't touched them.
  const dateFrom  = userDateFrom  ?? bounds?.minDate   ?? ''
  const dateTo    = userDateTo    ?? bounds?.maxDate    ?? ''
  const amountMin = userAmountMin ?? bounds?.minAmount  ?? 0
  const amountMax = userAmountMax ?? bounds?.maxAmount  ?? 0

  const resetFilters = () => {
    setUserDateFrom(null)
    setUserDateTo(null)
    setUserAmountMin(null)
    setUserAmountMax(null)
    setSelectedTypes(new Set())
    setDescSearch('')
  }

  const toggleType = (type: TransactionType) =>
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) { next.delete(type) } else { next.add(type) }
      return next
    })

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    // If the user hasn't set any filter, skip the loop entirely.
    const anyUserFilter =
      userDateFrom !== null || userDateTo !== null ||
      userAmountMin !== null || userAmountMax !== null ||
      selectedTypes.size > 0 || descSearch !== ''
    if (!anyUserFilter) return transactions

    return transactions.filter(t => {
      if (t.date   < dateFrom)  return false
      if (t.date   > dateTo)    return false
      if (t.amount < amountMin) return false
      if (t.amount > amountMax) return false
      if (selectedTypes.size > 0 && !selectedTypes.has(t.type as TransactionType)) return false
      if (descSearch && !t.description.toLowerCase().includes(descSearch.toLowerCase())) return false
      return true
    })
  }, [transactions, userDateFrom, userDateTo, userAmountMin, userAmountMax,
      dateFrom, dateTo, amountMin, amountMax, selectedTypes, descSearch])

  // ── Active filter indicator ───────────────────────────────────────────────

  const hasActiveFilter =
    userDateFrom  !== null || userDateTo    !== null ||
    userAmountMin !== null || userAmountMax !== null ||
    selectedTypes.size > 0 || descSearch   !== ''

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header row — never scrolls */}
      <div className="flex items-center justify-between shrink-0 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            Transactions
          </h2>
          {hasActiveFilter && (
            <span className="text-xs text-slate-500">
              {filtered.length} of {transactions.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {transactions.length > 0 && (
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 text-sm transition-colors
                ${showFilters || hasActiveFilter
                  ? 'text-indigo-400 hover:text-indigo-300'
                  : 'text-slate-400 hover:text-slate-200'}`}
            >
              <SlidersHorizontal size={15} />
              Filters
              {hasActiveFilter && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              )}
            </button>
          )}

          <button
            onClick={onImport}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <FileUp size={15} />
            Import CSV
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <PlusCircle size={16} />
            Add transaction
          </button>
        </div>
      </div>

      {/* Filter panel — collapsible, never scrolls */}
      {showFilters && bounds && (
        <div className="shrink-0 mb-3">
          <TransactionFilters
            bounds={bounds}
            currency={currency}
            dateFrom={dateFrom}
            dateTo={dateTo}
            amountMin={amountMin}
            amountMax={amountMax}
            selectedTypes={selectedTypes}
            descSearch={descSearch}
            onDateFromChange={setUserDateFrom}
            onDateToChange={setUserDateTo}
            onAmountMinChange={setUserAmountMin}
            onAmountMaxChange={setUserAmountMax}
            onTypeToggle={toggleType}
            onDescSearchChange={setDescSearch}
            onReset={resetFilters}
          />
        </div>
      )}

      {/* Transaction items — the only part that scrolls */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 min-h-0">
        {loading ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : filtered.length === 0 && transactions.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-slate-500 text-sm">No transactions match these filters.</p>
            <button
              onClick={resetFilters}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Reset filters
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-12">No transactions yet. Add the first one!</p>
        ) : (
          filtered.map(txn => (
            <TransactionItem
              key={txn.id}
              transaction={txn}
              profiles={profiles}
              currency={currency}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

    </div>
  )
}
