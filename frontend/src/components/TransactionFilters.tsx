import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Currency, TransactionType } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number, step: number): string {
  if (step >= 1) return String(Math.round(v))
  return parseFloat(v.toFixed(2)).toString()
}

function isoShort(d: string): string {
  if (!d) return ''
  const [, m, day] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[+m - 1]} ${+day}`
}

// ── Calendar date-range picker ────────────────────────────────────────────────

const DAY_HDR   = ['Mo','Tu','We','Th','Fr','Sa','Su']
const MONTH_NAM = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December']

interface DateRangePickerProps {
  from:         string   // YYYY-MM-DD
  to:           string   // YYYY-MM-DD
  minDate:      string
  maxDate:      string
  onFromChange: (v: string) => void
  onToChange:   (v: string) => void
}

function DateRangePicker({ from, to, minDate, maxDate, onFromChange, onToChange }: DateRangePickerProps) {
  const [open,      setOpen]      = useState(false)
  const [selecting, setSelecting] = useState<'start' | 'end'>('start')
  const [hover,     setHover]     = useState<string | null>(null)
  const [view,      setView]      = useState<{ year: number; month: number }>(() => {
    if (from) { const [y, m] = from.split('-').map(Number); return { year: y, month: m - 1 } }
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }
  })
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setSelecting('start'); setHover(null)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const prevMonth = () =>
    setView(v => v.month === 0  ? { year: v.year - 1, month: 11 }      : { ...v, month: v.month - 1 })
  const nextMonth = () =>
    setView(v => v.month === 11 ? { year: v.year + 1, month:  0 }      : { ...v, month: v.month + 1 })

  // Build Monday-first day grid for the current view month
  const buildGrid = (): (string | null)[] => {
    const { year, month } = view
    const startDow  = (new Date(year, month, 1).getDay() + 6) % 7
    const daysInMon = new Date(year, month + 1, 0).getDate()
    const cells: (string | null)[] = Array(startDow).fill(null)
    for (let d = 1; d <= daysInMon; d++)
      cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    return cells
  }

  const handleDayClick = (day: string) => {
    if (selecting === 'start') {
      onFromChange(day); onToChange(day)   // reset end
      setSelecting('end')
    } else {
      if (day < from) { onFromChange(day); onToChange(from) }
      else            { onToChange(day) }
      setSelecting('start'); setOpen(false); setHover(null)
    }
  }

  const openCalendar = () => {
    if (from) { const [y, m] = from.split('-').map(Number); setView({ year: y, month: m - 1 }) }
    setSelecting('start'); setHover(null); setOpen(true)
  }

  // Compute effective range (including hover preview while picking end)
  const effEnd = selecting === 'end' && hover ? hover : to
  const lo = from <= effEnd ? from : effEnd
  const hi = from <= effEnd ? effEnd : from

  const today = new Date().toISOString().slice(0, 10)
  const cells  = buildGrid()

  const triggerLabel = from && to
    ? from === to ? isoShort(from) : `${isoShort(from)} → ${isoShort(to)}`
    : 'Select range'

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={openCalendar}
        className="flex items-center gap-2 w-full bg-white/[0.05] border border-white/[0.08]
                   rounded-lg px-2.5 py-1.5 text-xs text-left hover:border-white/20
                   transition-colors"
      >
        <Calendar size={12} className="text-white/30 shrink-0" />
        <span className={from ? 'text-white/70' : 'text-white/25'}>{triggerLabel}</span>
        {selecting === 'end' && open && (
          <span className="ml-auto text-[9px] text-indigo-400 animate-pulse">pick end</span>
        )}
      </button>

      {/* Calendar popover */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-[252px]
                        bg-[#15152a] border border-white/[0.10] rounded-xl shadow-2xl p-3">

          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth}
              className="p-1 rounded text-white/35 hover:text-white/80 transition-colors">
              <ChevronLeft size={13} />
            </button>
            <span className="text-[11px] font-semibold text-white/80">
              {MONTH_NAM[view.month]} {view.year}
            </span>
            <button onClick={nextMonth}
              className="p-1 rounded text-white/35 hover:text-white/80 transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_HDR.map(h => (
              <div key={h} className="text-center text-[9px] text-white/20 py-0.5">{h}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const outside  = day < minDate || day > maxDate
              const isLo     = day === lo && lo !== hi
              const isHi     = day === hi && lo !== hi
              const inRange  = day > lo && day < hi
              const isPoint  = day === lo && lo === hi
              const isToday  = day === today

              return (
                <button
                  key={day}
                  disabled={outside}
                  onClick={() => !outside && handleDayClick(day)}
                  onMouseEnter={() => selecting === 'end' && !outside && setHover(day)}
                  onMouseLeave={() => setHover(null)}
                  className={[
                    'relative text-[11px] py-1 text-center transition-colors duration-75',
                    // Rounding: square-off edges that are adjacent to range fill
                    isLo    ? 'rounded-l-md rounded-r-none'
                    : isHi  ? 'rounded-r-md rounded-l-none'
                    : inRange ? 'rounded-none'
                              : 'rounded-md',
                    outside  ? 'text-white/15 cursor-default'
                    : isLo || isHi || isPoint
                              ? 'bg-indigo-500 text-white font-semibold'
                    : inRange ? 'bg-indigo-500/20 text-indigo-300'
                    : isToday ? 'text-white font-semibold hover:bg-white/[0.08]'
                              : 'text-white/55 hover:bg-white/[0.08] hover:text-white/90',
                  ].join(' ')}
                >
                  {+day.split('-')[2]}
                  {isToday && !isLo && !isHi && !isPoint && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2
                                     w-1 h-1 rounded-full bg-indigo-400 block" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Status hint */}
          <div className="mt-2 pt-2 border-t border-white/[0.06] text-center text-[10px] text-white/30">
            {selecting === 'start' ? 'Click to set start date' : 'Now click an end date'}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Dual-range slider ─────────────────────────────────────────────────────────

interface DualRangeSliderProps {
  min:         number
  max:         number
  step:        number
  valueMin:    number
  valueMax:    number
  onChangeMin: (v: number) => void
  onChangeMax: (v: number) => void
  currency:    Currency
}

function DualRangeSlider({
  min, max, step, valueMin, valueMax, onChangeMin, onChangeMax, currency,
}: DualRangeSliderProps) {
  const range  = max - min || 1
  const pctMin = ((valueMin - min) / range) * 100
  const pctMax = ((valueMax - min) / range) * 100

  // Dynamic z-index: whichever thumb the pointer is closest to goes on top.
  // This lets the user grab the left thumb even when it's at 0%.
  const [minOnTop, setMinOnTop] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const x    = ((e.clientX - rect.left) / rect.width) * 100
    setMinOnTop(Math.abs(x - pctMin) <= Math.abs(x - pctMax))
  }

  // Zero marker — only shown when 0 is within the data range
  const showZero = min < 0 && max > 0
  const pctZero  = showZero ? (-min / range) * 100 : null

  // Draft state lets the user type freely; commits only on blur / Enter
  const [draftMin, setDraftMin] = useState(fmt(valueMin, step))
  const [draftMax, setDraftMax] = useState(fmt(valueMax, step))

  useEffect(() => setDraftMin(fmt(valueMin, step)), [valueMin, step])
  useEffect(() => setDraftMax(fmt(valueMax, step)), [valueMax, step])

  const commitMin = () => {
    const v = parseFloat(draftMin)
    if (!isNaN(v)) onChangeMin(Math.max(min, Math.min(v, valueMax - step)))
    else setDraftMin(fmt(valueMin, step))
  }
  const commitMax = () => {
    const v = parseFloat(draftMax)
    if (!isNaN(v)) onChangeMax(Math.min(max, Math.max(v, valueMin + step)))
    else setDraftMax(fmt(valueMax, step))
  }

  const inputCls = `w-24 bg-white/[0.05] border border-white/[0.08] rounded-md px-2 py-1
                    text-xs text-white/70 outline-none focus:border-white/20 transition-colors
                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                    [&::-webkit-inner-spin-button]:appearance-none`

  const currencyLabel = currency === 'NOK' ? 'kr' : currency

  // Track background — red left-of-zero, green right-of-zero
  const trackBg = pctZero !== null
    ? `linear-gradient(to right,
        rgb(239 68 68 / 0.25) 0%,
        rgb(239 68 68 / 0.25) ${pctZero}%,
        rgb(16 185 129 / 0.25) ${pctZero}%,
        rgb(16 185 129 / 0.25) 100%)`
    : min >= 0
    ? 'rgb(16 185 129 / 0.18)'
    : 'rgb(239 68 68 / 0.18)'

  return (
    <div className="space-y-2">
      <div className="relative">
        {/* Track + thumbs — onMouseMove here keeps z-index correct even
            when the cursor is between the two invisible inputs */}
        <div
          ref={trackRef}
          className="relative h-5 flex items-center"
          onMouseMove={handleMouseMove}
        >
          {/* Background track: red ↔ green */}
          <div className="absolute inset-x-0 h-[3px] rounded-full"
               style={{ background: trackBg }} />

          {/* Selected-range fill */}
          <div className="absolute h-[3px] rounded-full bg-indigo-500/55"
               style={{ left: `${pctMin}%`, right: `${100 - pctMax}%` }} />

          {/* Zero tick */}
          {pctZero !== null && (
            <div className="absolute w-px h-3 bg-white/25 pointer-events-none z-[1]"
                 style={{ left: `${pctZero}%`, top: '50%', transform: 'translate(-50%,-50%)' }} />
          )}

          {/* Visual thumbs (pointer-events: none — invisible inputs handle dragging) */}
          <div className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-md -translate-x-1/2
                          pointer-events-none z-10 ring-1 ring-white/30"
               style={{ left: `${pctMin}%` }} />
          <div className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-md -translate-x-1/2
                          pointer-events-none z-10 ring-1 ring-white/30"
               style={{ left: `${pctMax}%` }} />

          {/* Invisible range inputs — both full-width; z-index swaps dynamically on mouse proximity */}
          <input
            type="range" min={min} max={max} step={step} value={valueMin}
            onChange={e => onChangeMin(Math.min(Number(e.target.value), valueMax - step))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            style={{ zIndex: minOnTop ? 5 : 3 }}
          />
          <input
            type="range" min={min} max={max} step={step} value={valueMax}
            onChange={e => onChangeMax(Math.max(Number(e.target.value), valueMin + step))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            style={{ zIndex: minOnTop ? 3 : 5 }}
          />
        </div>

        {/* Zero label row */}
        {pctZero !== null && (
          <div className="relative h-3.5 pointer-events-none select-none">
            <span className="absolute text-[9px] text-white/35 -translate-x-1/2"
                  style={{ left: `${pctZero}%` }}>
              0
            </span>
          </div>
        )}
      </div>

      {/* Exact-value text inputs */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <input type="number" step={step} value={draftMin}
            onChange={e => setDraftMin(e.target.value)}
            onBlur={commitMin}
            onKeyDown={e => e.key === 'Enter' && commitMin()}
            className={inputCls} />
          <span className="text-[10px] text-white/25">{currencyLabel}</span>
        </div>
        <div className="flex-1 h-px bg-white/10" />
        <div className="flex items-center gap-1">
          <input type="number" step={step} value={draftMax}
            onChange={e => setDraftMax(e.target.value)}
            onBlur={commitMax}
            onKeyDown={e => e.key === 'Enter' && commitMax()}
            className={inputCls} />
          <span className="text-[10px] text-white/25">{currencyLabel}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main filter panel ─────────────────────────────────────────────────────────

export interface TxnBounds {
  minDate:   string
  maxDate:   string
  minAmount: number
  maxAmount: number
}

interface Props {
  bounds:        TxnBounds
  currency:      Currency
  dateFrom:      string
  dateTo:        string
  amountMin:     number
  amountMax:     number
  selectedTypes: Set<TransactionType>
  descSearch:    string
  onDateFromChange:   (v: string) => void
  onDateToChange:     (v: string) => void
  onAmountMinChange:  (v: number) => void
  onAmountMaxChange:  (v: number) => void
  onTypeToggle:       (t: TransactionType) => void
  onDescSearchChange: (v: string) => void
  onReset:            () => void
}

const TYPE_CONFIG: {
  type: TransactionType; label: string; icon: string; active: string; inactive: string
}[] = [
  {
    type: 'expense', label: 'Expense', icon: '🧾',
    active:   'bg-red-500/20 border-red-500/40 text-red-300',
    inactive: 'bg-white/[0.03] border-white/[0.07] text-white/35 hover:text-white/60',
  },
  {
    type: 'refill', label: 'Refill', icon: '💰',
    active:   'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    inactive: 'bg-white/[0.03] border-white/[0.07] text-white/35 hover:text-white/60',
  },
  {
    type: 'income', label: 'Income', icon: '📈',
    active:   'bg-sky-500/20 border-sky-500/40 text-sky-300',
    inactive: 'bg-white/[0.03] border-white/[0.07] text-white/35 hover:text-white/60',
  },
  {
    type: 'settlement', label: 'Settle', icon: '↔',
    active:   'bg-violet-500/20 border-violet-500/40 text-violet-300',
    inactive: 'bg-white/[0.03] border-white/[0.07] text-white/35 hover:text-white/60',
  },
]

const LABEL = 'block text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1.5'

export default function TransactionFilters({
  bounds, currency,
  dateFrom, dateTo, amountMin, amountMax, selectedTypes, descSearch,
  onDateFromChange, onDateToChange, onAmountMinChange, onAmountMaxChange,
  onTypeToggle, onDescSearchChange, onReset,
}: Props) {
  const amountRange = Math.abs(bounds.maxAmount - bounds.minAmount)
  const sliderStep  = amountRange <= 100 ? 0.01 : amountRange <= 1000 ? 0.1 : 1

  return (
    <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 space-y-3">

      {/* ── Clear all (top-right) ── */}
      <button
        onClick={onReset}
        title="Clear all filters"
        className="absolute top-2.5 right-2.5 flex items-center gap-1
                   text-[10px] text-white/25 hover:text-white/60 transition-colors"
      >
        <X size={10} />
        Clear all
      </button>

      {/* ── Date range ── */}
      <div>
        <span className={LABEL}>Date range</span>
        <DateRangePicker
          from={dateFrom}          to={dateTo}
          minDate={bounds.minDate} maxDate={bounds.maxDate}
          onFromChange={onDateFromChange}
          onToChange={onDateToChange}
        />
      </div>

      {/* ── Amount range ── */}
      <div>
        <span className={LABEL}>Amount range</span>
        <DualRangeSlider
          min={bounds.minAmount} max={bounds.maxAmount} step={sliderStep}
          valueMin={amountMin}   valueMax={amountMax}
          onChangeMin={onAmountMinChange} onChangeMax={onAmountMaxChange}
          currency={currency}
        />
      </div>

      {/* ── Transaction type ── */}
      <div>
        <span className={LABEL}>Type</span>
        <div className="flex gap-2">
          {TYPE_CONFIG.map(({ type, label, icon, active, inactive }) => (
            <button
              key={type}
              onClick={() => onTypeToggle(type)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs
                          font-medium transition-all duration-150
                          ${selectedTypes.has(type) ? active : inactive}`}
            >
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Description search ── */}
      <div>
        <span className={LABEL}>Description</span>
        <input
          type="text"
          value={descSearch}
          onChange={e => onDescSearchChange(e.target.value)}
          placeholder="Search descriptions…"
          className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg
                     px-2.5 py-1.5 text-xs text-white/70 placeholder-white/20
                     outline-none focus:border-white/20 transition-colors"
        />
      </div>

    </div>
  )
}
