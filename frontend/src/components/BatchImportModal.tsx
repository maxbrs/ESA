import { useState, useCallback, useRef } from 'react'
import Papa from 'papaparse'
import { X, Upload, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft, ChevronDown, PanelRight, Scale } from 'lucide-react'
import type { Account, Profile, Transaction, TransactionCreate, TransactionType } from '../types/index'
import { api } from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RefillAssignment {
  /** 'refill' → weights go 100 % to one profile; 'income' → use account default weights */
  type: 'refill' | 'income'
  profileId: string
}

interface ColumnMapping {
  dateCol: string
  descCol: string
  amountMode: 'single' | 'dual'
  singleAmountCol: string
  amountInCol: string
  amountOutCol: string
  inType: TransactionType
  outType: TransactionType
}

interface ParsedRow {
  idx: number
  date: string
  description: string
  amount: number       // always positive
  type: TransactionType
  selected: boolean
  isDuplicate: boolean
  error?: string
}

interface Props {
  account: Account
  profiles: Profile[]
  existingTransactions: Transaction[]
  activeProfileId: string
  onImported: () => void
  onClose: () => void
}

type Step = 'upload' | 'map' | 'review' | 'assign' | 'importing' | 'done'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(raw: string): string | null {
  const s = raw.trim()
  // DD.MM.YYYY  (Norwegian bank format)
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '')
  if (!s) return null
  // Allow both . and , as decimal separator
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? null : n
}

function autoSuggest(headers: string[]): ColumnMapping {
  const lh = headers.map(h => h.toLowerCase())
  const find = (...kws: string[]) =>
    headers.find((_, i) => kws.some(k => lh[i].includes(k))) ?? ''

  const inCol  = find('inn', 'credit')
  const outCol = find(' ut', 'debit', 'beløp ut', 'belop ut')
  // fallback for "beløp ut" without leading space
  const outCol2 = outCol || find('ut')

  return {
    dateCol: find('utfø', 'dato', 'date') || headers[0] || '',
    descCol: find('beskrivelse', 'description', 'tekst', 'text') || headers[1] || '',
    amountMode: (inCol && (outCol || outCol2)) ? 'dual' : 'single',
    singleAmountCol: find('amount', 'beløp', 'belop') || '',
    amountInCol: inCol,
    amountOutCol: outCol || outCol2,
    inType: 'refill',
    outType: 'expense',
  }
}

function applyMapping(
  data: string[][],
  headers: string[],
  mapping: ColumnMapping,
  existing: Transaction[],
): ParsedRow[] {
  const ci = (col: string) => headers.indexOf(col)
  const results: ParsedRow[] = []

  for (let i = 0; i < data.length; i++) {
    const row = data[i]

    // Skip rows with no valid date (footer/total rows)
    const dateRaw = row[ci(mapping.dateCol)] ?? ''
    const date = parseDate(dateRaw)
    if (!date) continue

    const description = (row[ci(mapping.descCol)] ?? '').trim()

    let amount: number
    let type: TransactionType

    if (mapping.amountMode === 'dual') {
      const inIdx  = ci(mapping.amountInCol)
      const outIdx = ci(mapping.amountOutCol)
      const inAmt  = inIdx  >= 0 ? parseAmount(row[inIdx]  ?? '') : null
      const outAmt = outIdx >= 0 ? parseAmount(row[outIdx] ?? '') : null

      if (inAmt !== null && inAmt !== 0) {
        amount = Math.abs(inAmt)
        type   = mapping.inType
      } else if (outAmt !== null && outAmt !== 0) {
        amount = Math.abs(outAmt)
        type   = mapping.outType
      } else {
        continue // both empty — skip
      }
    } else {
      const amtIdx = ci(mapping.singleAmountCol)
      const parsed = amtIdx >= 0 ? parseAmount(row[amtIdx] ?? '') : null
      if (parsed === null || parsed === 0) continue
      amount = Math.abs(parsed)
      type   = parsed >= 0 ? mapping.inType : mapping.outType
    }

    // Duplicate: same date + description + abs(amount)
    const isDuplicate = existing.some(
      t => t.date === date && t.description === description && Math.abs(t.amount) === amount,
    )

    results.push({ idx: i, date, description, amount, type, selected: !isDuplicate, isDuplicate })
  }

  return results
}

// ── Component ─────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<TransactionType, string> = {
  refill:     'text-emerald-400',
  expense:    'text-red-400',
  income:     'text-blue-400',
  settlement: 'text-violet-400',
}
const TYPE_LABEL: Record<TransactionType, string> = {
  refill: 'Refill', expense: 'Expense', income: 'Income', settlement: 'Settlement',
}

export default function BatchImportModal({
  account, profiles, existingTransactions, activeProfileId, onImported, onClose,
}: Props) {
  const [step,         setStep]         = useState<Step>('upload')
  const [headers,      setHeaders]      = useState<string[]>([])
  const [rawData,      setRawData]      = useState<string[][]>([])
  const [mapping,      setMapping]      = useState<ColumnMapping>({
    dateCol: '', descCol: '', amountMode: 'dual',
    singleAmountCol: '', amountInCol: '', amountOutCol: '',
    inType: 'refill', outType: 'expense',
  })
  // Latest date across already-stored transactions — used to pre-fill the date filter
  const latestExistingDate = existingTransactions.reduce(
    (max, t) => (t.date > max ? t.date : max), '',
  )

  const [parsedRows,        setParsedRows]        = useState<ParsedRow[]>([])
  const [refillAssignments, setRefillAssignments] = useState<Record<string, RefillAssignment>>({})
  const [expandedDescs,     setExpandedDescs]     = useState<Set<string>>(new Set())
  const [showExcludedPanel, setShowExcludedPanel] = useState(false)
  const [filterDate,        setFilterDate]        = useState(latestExistingDate)

  const toggleDescExpanded = (desc: string) =>
    setExpandedDescs(prev => {
      const next = new Set(prev)
      next.has(desc) ? next.delete(desc) : next.add(desc)
      return next
    })
  const [progress,          setProgress]          = useState(0)
  const [importError,       setImportError]       = useState<string | null>(null)
  const [importedCount,     setImportedCount]     = useState(0)
  const [isDragOver,        setIsDragOver]        = useState(false)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const progressTimer  = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── File parsing ──────────────────────────────────────────────────────────

  const loadFile = useCallback((file: File) => {
    Papa.parse<string[]>(file, {
      delimiter: '',          // auto-detect ; or ,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const rows = data as string[][]
        if (rows.length < 2) return
        const [hdr, ...rest] = rows
        setHeaders(hdr)
        setRawData(rest)
        setMapping(autoSuggest(hdr))
        setStep('map')
      },
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }, [loadFile])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
  }

  // ── Step transitions ──────────────────────────────────────────────────────

  const goToReview = () => {
    setParsedRows(applyMapping(rawData, headers, mapping, existingTransactions))
    setImportError(null)
    setStep('review')
  }

  const goToAssign = (rows: ParsedRow[]) => {
    // Collect distinct descriptions from selected refill rows
    const refillDescs = [
      ...new Set(
        rows
          .filter(r => r.selected && !r.error && r.type === 'refill')
          .map(r => r.description),
      ),
    ]
    if (refillDescs.length === 0) {
      // No refills — skip straight to import
      runImport(rows, {})
      return
    }
    const defaults: Record<string, RefillAssignment> = {}
    for (const desc of refillDescs) {
      // No profile pre-selected — every line must be explicitly reviewed before importing.
      defaults[desc] = { type: 'refill', profileId: '' }
    }
    setRefillAssignments(defaults)
    setStep('assign')
  }

  // ── Import ────────────────────────────────────────────────────────────────

  const runImport = async (
    rows: ParsedRow[] = parsedRows,
    assignments: Record<string, RefillAssignment> = refillAssignments,
  ) => {
    const toImport = rows.filter(r => r.selected && !r.error)
    if (toImport.length === 0) return

    setStep('importing')
    setProgress(0)
    setImportError(null)

    // Simulate progress up to 90 % while waiting for the API
    let pct = 0
    progressTimer.current = setInterval(() => {
      pct = Math.min(pct + Math.random() * 7 + 2, 90)
      setProgress(Math.round(pct))
    }, 250)

    const transactions: TransactionCreate[] = toImport.map(r => {
      if (r.type !== 'refill') {
        return {
          type: r.type,
          description: r.description,
          amount: r.amount,
          date: r.date,
          created_by: activeProfileId,
          weights: { ...account.profile_weights },
        }
      }
      // Apply the refill assignment for this description
      const asgn = assignments[r.description]
      if (!asgn || asgn.type === 'income') {
        return {
          type: 'income' as TransactionType,
          description: r.description,
          amount: r.amount,
          date: r.date,
          created_by: activeProfileId,
          weights: { ...account.profile_weights },
        }
      }
      // Refill → 100 % weight to the chosen profile
      return {
        type: 'refill' as TransactionType,
        description: r.description,
        amount: r.amount,
        date: r.date,
        created_by: activeProfileId,
        weights: { [asgn.profileId]: 1.0 },
      }
    })

    const originStep = Object.keys(assignments).length > 0 ? 'assign' : 'review'

    try {
      const result = await api.batchCreateTransactions(account.id, transactions)
      clearInterval(progressTimer.current!)
      setProgress(100)
      setImportedCount(result.length)
      onImported()
      setStep('done')
    } catch (err) {
      clearInterval(progressTimer.current!)
      setImportError(err instanceof Error ? err.message : 'Import failed')
      setStep(originStep)
    }
  }

  const toggleRow = (idx: number) =>
    setParsedRows(prev => prev.map(r => r.idx === idx ? { ...r, selected: !r.selected } : r))

  const validRows      = parsedRows.filter(r => !r.error)
  const selectedCount  = validRows.filter(r => r.selected).length
  const duplicateCount = parsedRows.filter(r => r.isDuplicate).length
  const allSelected    = validRows.length > 0 && validRows.every(r => r.selected)
  const toggleAll      = () => setParsedRows(prev => prev.map(r => r.error ? r : { ...r, selected: !allSelected }))

  // ── Render ────────────────────────────────────────────────────────────────

  const refillDescCount = Object.keys(refillAssignments).length
  const stepLabel = {
    upload:    'Drop a bank CSV export to import transactions',
    map:       'Map CSV columns to transaction fields',
    review:    `Review ${parsedRows.length} rows before importing`,
    assign:    `Assign ${refillDescCount} distinct refill description${refillDescCount !== 1 ? 's' : ''} to profiles`,
    importing: 'Writing to Google Sheets…',
    done:      `Successfully imported ${importedCount} transactions`,
  }[step]

  // ── Excluded-rows panel data ──────────────────────────────────────────────
  const excludedRows = parsedRows.filter(r => !r.selected && !r.error)
  const excludedNet  = excludedRows.reduce((sum, r) =>
    sum + (r.type === 'expense' ? -r.amount : r.amount), 0)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-800 border border-white/10 rounded-2xl w-full flex flex-col max-h-[90vh] transition-all duration-200 ${
        step === 'review' && showExcludedPanel ? 'max-w-5xl' : 'max-w-3xl'
      }`}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">Import CSV</h2>
            <p className="text-slate-400 text-sm mt-0.5">{stepLabel}</p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body — flex-row so the excluded side panel can sit alongside step content */}
        <div className="flex-1 flex min-h-0">

        {/* Main step content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">

          {/* ── Step: Upload ── */}
          {step === 'upload' && (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-16 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
                isDragOver ? 'border-indigo-400 bg-indigo-400/10' : 'border-white/20 hover:border-white/40'
              }`}
            >
              <Upload size={40} className="text-slate-400" />
              <div className="text-center">
                <p className="text-white font-medium">Drop your CSV file here</p>
                <p className="text-slate-400 text-sm mt-1">or click to browse</p>
              </div>
              <p className="text-slate-500 text-xs">Supports semicolon and comma separated files · UTF-8</p>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileInput} />
            </div>
          )}

          {/* ── Step: Map ── */}
          {step === 'map' && (
            <div className="flex flex-col gap-6">
              {/* Preview */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">CSV preview — first 5 rows</p>
                <div className="overflow-x-auto rounded-lg border border-white/10 text-xs">
                  <table className="w-full text-slate-300">
                    <thead>
                      <tr className="bg-white/5">
                        {headers.map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap border-r border-white/5 last:border-0">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-white/5">
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-1.5 truncate max-w-28 border-r border-white/5 last:border-0">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Column mapping */}
              <div className="grid grid-cols-2 gap-4">
                <ColSelect label="Date column" value={mapping.dateCol} options={headers}
                  onChange={v => setMapping(m => ({ ...m, dateCol: v }))} />
                <ColSelect label="Description column" value={mapping.descCol} options={headers}
                  onChange={v => setMapping(m => ({ ...m, descCol: v }))} />
              </div>

              {/* Amount mode */}
              <div className="flex flex-col gap-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Amount columns</p>
                <div className="flex gap-2">
                  {(['dual', 'single'] as const).map(mode => (
                    <button key={mode} type="button"
                      onClick={() => setMapping(m => ({ ...m, amountMode: mode }))}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        mapping.amountMode === mode
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white/10 text-slate-300 hover:bg-white/20'
                      }`}>
                      {mode === 'dual' ? 'Separate In / Out columns' : 'Single amount column'}
                    </button>
                  ))}
                </div>

                {mapping.amountMode === 'dual' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <ColSelect label="Amount In (+, e.g. refills)" value={mapping.amountInCol} options={headers}
                      onChange={v => setMapping(m => ({ ...m, amountInCol: v }))} />
                    <ColSelect label="Amount Out (−, e.g. expenses)" value={mapping.amountOutCol} options={headers}
                      onChange={v => setMapping(m => ({ ...m, amountOutCol: v }))} />
                  </div>
                ) : (
                  <ColSelect label="Amount column (positive = in, negative = out)" value={mapping.singleAmountCol} options={headers}
                    onChange={v => setMapping(m => ({ ...m, singleAmountCol: v }))} />
                )}
              </div>

              {/* Type mapping */}
              <div className="flex flex-col gap-3">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Transaction types</p>
                <div className="grid grid-cols-2 gap-4">
                  <TypeSelect label="Incoming amounts → type" value={mapping.inType}
                    onChange={v => setMapping(m => ({ ...m, inType: v }))} />
                  <TypeSelect label="Outgoing amounts → type" value={mapping.outType}
                    onChange={v => setMapping(m => ({ ...m, outType: v }))} />
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Review ── */}
          {step === 'review' && (
            <div className="flex flex-col gap-4">
              {/* Summary */}
              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 bg-white/5 rounded-lg px-4 py-3 min-w-32">
                  <span className="text-white font-semibold">{parsedRows.length}</span>
                  <span className="text-slate-400 text-sm ml-2">rows detected</span>
                </div>
                <div className="flex-1 bg-white/5 rounded-lg px-4 py-3 min-w-32">
                  <span className="text-indigo-400 font-semibold">{selectedCount}</span>
                  <span className="text-slate-400 text-sm ml-2">selected to import</span>
                </div>
                {duplicateCount > 0 && (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
                    <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                    <span className="text-amber-300 text-sm">
                      {duplicateCount} potential duplicate{duplicateCount > 1 ? 's' : ''} auto-deselected
                    </span>
                  </div>
                )}
                {/* Excluded panel toggle */}
                <button
                  onClick={() => setShowExcludedPanel(p => !p)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm transition-colors ${
                    showExcludedPanel
                      ? 'bg-slate-600 text-white'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <PanelRight size={14} />
                  <span>Excluded{excludedRows.length > 0 ? ` · ${excludedRows.length}` : ''}</span>
                  {excludedRows.length > 0 && Math.abs(excludedNet) < 0.005 && (
                    <span className="text-emerald-400 text-xs">✓</span>
                  )}
                  {excludedRows.length > 0 && Math.abs(excludedNet) >= 0.005 && (
                    <span className="text-amber-400 text-xs">≠0</span>
                  )}
                </button>
              </div>

              {importError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-300 text-sm">
                  ❌ {importError}
                </div>
              )}

              {/* ── Date filter ── */}
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 mb-1">
                    Deselect rows strictly before date
                    {latestExistingDate
                      ? <span className="text-slate-500"> (latest stored transaction: <span className="font-mono">{latestExistingDate}</span>)</span>
                      : <span className="text-slate-500"> (no stored transactions yet)</span>
                    }
                  </p>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={e => setFilterDate(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-white/40 font-mono"
                  />
                </div>
                <button
                  type="button"
                  disabled={!filterDate}
                  onClick={() => {
                    if (!filterDate) return
                    setParsedRows(prev => prev.map(r =>
                      r.date < filterDate ? { ...r, selected: false } : r,
                    ))
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
                >
                  Apply
                </button>
              </div>

              {/* Table */}
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 text-slate-400 text-xs uppercase tracking-wide">
                      <th className="px-3 py-2 w-8">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll}
                          className="accent-indigo-500 cursor-pointer" />
                      </th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-center">Type</th>
                      <th className="px-3 py-2 w-7"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map(row => (
                      <tr key={row.idx}
                        onClick={() => toggleRow(row.idx)}
                        className={`border-t border-white/5 cursor-pointer transition-colors hover:bg-white/5 ${
                          !row.selected ? 'opacity-35' : row.isDuplicate ? 'bg-amber-500/5' : ''
                        }`}>
                        <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={row.selected} onChange={() => toggleRow(row.idx)}
                            className="accent-indigo-500 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2 text-slate-300 whitespace-nowrap font-mono text-xs">{row.date}</td>
                        <td className="px-3 py-2 text-white max-w-xs truncate">
                          {row.description || <span className="text-slate-500 italic text-xs">auto-generated</span>}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${TYPE_COLOR[row.type]}`}>
                          {row.type === 'expense' ? '−' : '+'}
                          {row.amount.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`px-3 py-2 text-center text-xs ${TYPE_COLOR[row.type]}`}>
                          {TYPE_LABEL[row.type]}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.isDuplicate && (
                            <span title="Potential duplicate">
                              <AlertTriangle size={13} className="text-amber-400" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-slate-500 text-xs">
                Expenses and income use the account's default split. Refill assignments are set in the next step.
              </p>
            </div>
          )}

          {/* ── Step: Assign refills ── */}
          {step === 'assign' && (
            <div className="flex flex-col gap-4">
              <p className="text-slate-400 text-sm">
                Each distinct description below was classified as a <span className="text-emerald-400 font-medium">Refill</span>.
                Pick who's topping up the account for each one, or reclassify as Income (uses the account's default split).
              </p>

              {importError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-300 text-sm">
                  ❌ {importError}
                </div>
              )}

              {(() => {
                const unresolved = Object.values(refillAssignments).filter(
                  a => a.type === 'refill' && a.profileId === '',
                ).length
                return unresolved > 0 ? (
                  <p className="text-amber-400 text-xs flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    {unresolved} assignment{unresolved !== 1 ? 's' : ''} still need{unresolved === 1 ? 's' : ''} a profile
                  </p>
                ) : null
              })()}

              {Object.entries(refillAssignments).map(([desc, asgn]) => {
                const matchingRows = parsedRows.filter(
                  r => r.selected && !r.error && r.type === 'refill' && r.description === desc,
                )
                const isExpanded = expandedDescs.has(desc)
                const needsProfile = asgn.type === 'refill' && asgn.profileId === ''

                return (
                  <div key={desc} className={`border rounded-xl overflow-hidden transition-colors ${
                    needsProfile
                      ? 'bg-amber-500/5 border-amber-500/40'
                      : 'bg-white/5 border-white/10'
                  }`}>
                    <div className="p-4 flex flex-col gap-3">

                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white font-medium truncate">
                            {desc || <span className="text-slate-500 italic text-sm">auto-generated description</span>}
                          </p>
                          {/* Expandable row count */}
                          <button
                            type="button"
                            onClick={() => toggleDescExpanded(desc)}
                            className="flex items-center gap-1 mt-0.5 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                          >
                            <ChevronDown
                              size={12}
                              className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            />
                            {matchingRows.length} row{matchingRows.length !== 1 ? 's' : ''}
                          </button>
                        </div>

                        {/* Refill / Income toggle */}
                        <div className="flex gap-1 flex-shrink-0">
                          {(['refill', 'income'] as const).map(t => (
                            <button key={t} type="button"
                              onClick={() => setRefillAssignments(prev => ({ ...prev, [desc]: { ...prev[desc], type: t } }))}
                              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                                asgn.type === t
                                  ? t === 'refill' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
                              }`}>
                              {t === 'refill' ? '💰 Refill' : '📈 Income'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Profile picker (only for refill) */}
                      {asgn.type === 'refill' && (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs text-slate-400">Who's refilling?</p>
                          <div className="flex gap-2 flex-wrap">
                            {profiles.map(p => (
                              <button key={p.id} type="button"
                                onClick={() => setRefillAssignments(prev => ({ ...prev, [desc]: { ...prev[desc], profileId: p.id } }))}
                                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${
                                  asgn.profileId === p.id
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                                }`}>
                                <span>{p.emoji}</span>
                                <span>{p.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Income explanation */}
                      {asgn.type === 'income' && (
                        <p className="text-xs text-slate-500">
                          Will be imported as Income using the account's default split:{' '}
                          {Object.entries(account.profile_weights).map(([pid, w]) => {
                            const p = profiles.find(pr => pr.id === pid)
                            return `${p?.name ?? pid} ${Math.round(w * 100)}%`
                          }).join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* ── Expandable row preview ── */}
                    {isExpanded && (
                      <div className="border-t border-white/10 bg-black/20">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 uppercase tracking-wide border-b border-white/5">
                              <th className="px-4 py-2 text-left font-medium">Date</th>
                              <th className="px-4 py-2 text-right font-medium">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {matchingRows.map(r => (
                              <tr key={r.idx} className="border-b border-white/5 last:border-0">
                                <td className="px-4 py-1.5 font-mono text-slate-400">{r.date}</td>
                                <td className="px-4 py-1.5 font-mono text-right text-emerald-400 font-semibold">
                                  +{r.amount.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Step: Importing ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center gap-6 py-12">
              <div className="w-full max-w-sm flex flex-col gap-2">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>
                    {progress < 30 ? 'Preparing batch…'
                      : progress < 70 ? 'Sending to server…'
                      : 'Writing to Google Sheets…'}
                  </span>
                  <span className="font-mono">{progress}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <p className="text-slate-400 text-sm">
                Importing {selectedCount} transaction{selectedCount !== 1 ? 's' : ''} in one batch…
              </p>
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <CheckCircle2 size={52} className="text-emerald-400" />
              <p className="text-white text-lg font-semibold">
                {importedCount} transaction{importedCount !== 1 ? 's' : ''} imported
              </p>
              <p className="text-slate-400 text-sm">All entries have been written to Google Sheets.</p>
            </div>
          )}

        </div>{/* /main step content */}

        {/* ── Excluded-rows side panel ── */}
        {step === 'review' && showExcludedPanel && (
          <div className="w-72 flex-shrink-0 border-l border-white/10 flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
              <span className="text-sm font-medium text-white">Excluded</span>
              <span className="text-xs text-slate-500 font-mono">{excludedRows.length} row{excludedRows.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {excludedRows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-500 text-xs">
                  <Scale size={20} className="opacity-40" />
                  <span>No excluded rows yet</span>
                </div>
              ) : (
                <>
                  {/* Net balance badge */}
                  <div className={`mx-4 mt-4 rounded-xl px-4 py-3 flex flex-col items-center gap-1 ${
                    Math.abs(excludedNet) < 0.005
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'bg-amber-500/10 border border-amber-500/30'
                  }`}>
                    <span className={`text-lg font-bold font-mono ${
                      Math.abs(excludedNet) < 0.005 ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {excludedNet >= 0 ? '+' : '−'}
                      {Math.abs(excludedNet).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-xs font-medium ${
                      Math.abs(excludedNet) < 0.005 ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {Math.abs(excludedNet) < 0.005 ? '✓ Balances to zero' : 'Net not zero'}
                    </span>
                  </div>

                  {/* Breakdown by type */}
                  {(['refill', 'income', 'expense'] as const)
                    .map(t => ({ t, rows: excludedRows.filter(r => r.type === t) }))
                    .filter(({ rows }) => rows.length > 0)
                    .map(({ t, rows }) => {
                      const total = rows.reduce((s, r) => s + (t === 'expense' ? -r.amount : r.amount), 0)
                      return (
                        <div key={t} className="mx-4 mt-3 flex items-center justify-between text-xs">
                          <span className={`${TYPE_COLOR[t]} font-medium`}>
                            {rows.length} {TYPE_LABEL[t].toLowerCase()}{rows.length !== 1 ? 's' : ''}
                          </span>
                          <span className={`font-mono ${TYPE_COLOR[t]}`}>
                            {total >= 0 ? '+' : '−'}
                            {Math.abs(total).toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )
                    })
                  }

                  {/* Row list */}
                  <div className="mx-4 mt-4 mb-4 border border-white/10 rounded-lg overflow-hidden">
                    {excludedRows.map((r, i) => (
                      <div key={r.idx}
                        className={`px-3 py-2 flex flex-col gap-0.5 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-slate-500 text-xs">{r.date}</span>
                          <span className={`font-mono font-semibold text-xs ${TYPE_COLOR[r.type]}`}>
                            {r.type === 'expense' ? '−' : '+'}
                            {r.amount.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        {r.description && (
                          <span className="text-slate-400 text-xs truncate">{r.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        </div>{/* /body flex-row */}

        {/* Footer */}
        <div className="flex gap-2 p-6 border-t border-white/10 flex-shrink-0">
          {step === 'map' && (
            <>
              <button onClick={() => setStep('upload')}
                className="flex items-center gap-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm">
                <ChevronLeft size={15} /> Back
              </button>
              <button onClick={goToReview}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors text-sm">
                Preview import <ChevronRight size={15} />
              </button>
            </>
          )}
          {step === 'review' && (() => {
            const hasRefills = parsedRows.some(r => r.selected && !r.error && r.type === 'refill')
            return (
              <>
                <button onClick={() => setStep('map')}
                  className="flex items-center gap-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm">
                  <ChevronLeft size={15} /> Back
                </button>
                <button
                  onClick={() => hasRefills ? goToAssign(parsedRows) : runImport()}
                  disabled={selectedCount === 0}
                  className="flex-1 flex items-center justify-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-medium transition-colors text-sm">
                  {hasRefills
                    ? <><span>Assign refills</span> <ChevronRight size={15} /></>
                    : `Import ${selectedCount} transaction${selectedCount !== 1 ? 's' : ''}`
                  }
                </button>
              </>
            )
          })()}
          {step === 'assign' && (() => {
            const unresolved = Object.values(refillAssignments).filter(
              a => a.type === 'refill' && a.profileId === '',
            ).length
            return (
              <>
                <button onClick={() => setStep('review')}
                  className="flex items-center gap-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm">
                  <ChevronLeft size={15} /> Back
                </button>
                <button
                  onClick={() => runImport(parsedRows, refillAssignments)}
                  disabled={unresolved > 0}
                  title={unresolved > 0 ? `${unresolved} refill${unresolved !== 1 ? 's' : ''} still need a profile` : undefined}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm">
                  {unresolved > 0
                    ? `${unresolved} profile${unresolved !== 1 ? 's' : ''} to assign`
                    : `Import ${selectedCount} transaction${selectedCount !== 1 ? 's' : ''}`
                  }
                </button>
              </>
            )
          })()}
          {(step === 'upload' || step === 'done') && (
            <button onClick={onClose}
              className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm">
              {step === 'done' ? 'Close' : 'Cancel'}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ColSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-slate-400">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/40">
        <option value="">(none)</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function TypeSelect({ label, value, onChange }: {
  label: string
  value: TransactionType
  onChange: (v: TransactionType) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-slate-400">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value as TransactionType)}
        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/40">
        <option value="refill">💰 Refill</option>
        <option value="expense">🧾 Expense</option>
        <option value="income">📈 Income</option>
      </select>
    </div>
  )
}
