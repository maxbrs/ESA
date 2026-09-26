import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Plus, Trash2 } from 'lucide-react'
import { evaluateArithmetic } from '../utils/arithmetic'

const STORAGE_KEY = 'tbd:calculator'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalcEntry {
  id:         string
  label:      string
  expression: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tryEvaluate(expr: string): number | null {
  try {
    return evaluateArithmetic(expr)
  } catch {
    return null
  }
}

/** Format for display — nb-NO locale (space thousands, comma decimal). */
function fmtDisplay(value: number): string {
  // toPrecision(10) eliminates floating-point noise (0.1 + 0.2 → 0.3, not 0.30000000004)
  const clean = parseFloat(value.toPrecision(10))
  return clean.toLocaleString('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 6 })
}

/** Raw value for clipboard — always a plain JS number string, safe to paste back. */
function fmtCopy(value: number): string {
  return String(parseFloat(value.toPrecision(10)))
}

function loadEntries(): CalcEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as CalcEntry[]
    return []
  } catch {
    return []
  }
}

function makeEntry(n: number): CalcEntry {
  return { id: crypto.randomUUID(), label: `Calc ${n}`, expression: '' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CalculatorPanel() {
  const [entries, setEntries] = useState<CalcEntry[]>(() => {
    const stored = loadEntries()
    return stored.length > 0 ? stored : [makeEntry(1)]
  })
  const [copiedId, setCopiedId] = useState<string | null>(null)
  // Ref map so we can programmatically focus expression inputs after adding.
  const exprRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Persist on every change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* ignore */ }
  }, [entries])

  const updateEntry = (id: string, patch: Partial<CalcEntry>) =>
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))

  const addEntry = () => {
    const e = makeEntry(entries.length + 1)
    setEntries(prev => [...prev, e])
    // Focus the new expression input after the DOM has updated
    setTimeout(() => exprRefs.current[e.id]?.focus(), 30)
  }

  const deleteEntry = (id: string) =>
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id)
      return next.length > 0 ? next : [makeEntry(1)]
    })

  const copyResult = async (entryId: string, value: number) => {
    try {
      await navigator.clipboard.writeText(fmtCopy(value))
      setCopiedId(entryId)
      setTimeout(() => setCopiedId(prev => prev === entryId ? null : prev), 1500)
    } catch { /* clipboard may be unavailable */ }
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Scrollable entry list ── */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {entries.map((entry, idx) => {
          const result     = tryEvaluate(entry.expression)
          const hasContent = entry.expression.trim().length > 0
          const isInvalid  = hasContent && result === null

          return (
            <div
              key={entry.id}
              className="group rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5"
            >
              {/* Label + delete icon */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <input
                  type="text"
                  value={entry.label}
                  onChange={e => updateEntry(entry.id, { label: e.target.value })}
                  placeholder={`Calc ${idx + 1}`}
                  className="flex-1 min-w-0 bg-transparent text-[11px] font-medium
                             text-white/35 hover:text-white/55 focus:text-white/70
                             outline-none placeholder-white/20 truncate"
                />
                {/* Only show delete when there is more than one entry */}
                {entries.length > 1 && (
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    title="Remove"
                    className="opacity-0 group-hover:opacity-100 text-white/20
                               hover:text-red-400/80 transition-all shrink-0"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>

              {/* Expression input */}
              <input
                ref={el => { exprRefs.current[entry.id] = el }}
                type="text"
                value={entry.expression}
                onChange={e => updateEntry(entry.id, { expression: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEntry() } }}
                placeholder="(80 + 50) * 3"
                spellCheck={false}
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg
                           px-3 py-1.5 text-sm font-mono text-white/80
                           placeholder-white/[0.15] outline-none
                           focus:border-white/20 focus:bg-white/[0.08]
                           transition-colors"
              />

              {/* Result row */}
              <div className="flex items-center justify-end gap-2 mt-1.5 h-5">
                {result !== null && (
                  <>
                    <span className="font-mono text-sm font-semibold text-emerald-300/90 tracking-tight">
                      = {fmtDisplay(result)}
                    </span>
                    <button
                      onClick={() => copyResult(entry.id, result)}
                      title="Copy result"
                      className="text-white/25 hover:text-white/70 transition-colors shrink-0"
                    >
                      {copiedId === entry.id
                        ? <Check size={12} className="text-emerald-400" />
                        : <Copy size={12} />
                      }
                    </button>
                  </>
                )}
                {isInvalid && (
                  <span className="font-mono text-xs text-white/15 select-none">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Add calculation button ── */}
      <div className="shrink-0 px-3 py-2 border-t border-white/[0.06]">
        <button
          onClick={addEntry}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                     text-xs font-medium text-white/30 hover:text-white/60
                     hover:bg-white/[0.06] transition-all duration-150"
        >
          <Plus size={12} />
          Add calculation
        </button>
      </div>

    </div>
  )
}
