import { GripHorizontal } from 'lucide-react'
import { useToolbox, type PanelState } from '../context/ToolboxContext'
import { useDraggable } from '../hooks/useDraggable'
import CalculatorPanel from './CalculatorPanel'
import NotesPanel from './NotesPanel'

// ── Per-tool panel dimensions ─────────────────────────────────────────────────

const TOOL_DIMS: Record<string, { w: number; h: number }> = {
  calculator: { w: 360, h: 420 },
  notes:      { w: 620, h: 460 },
}
const DEFAULT_DIMS = { w: 360, h: 300 }

const TOOL_META: Record<string, { label: string; emoji: string }> = {
  calculator: { label: 'Calculator', emoji: '🧮' },
  notes:      { label: 'Notes',      emoji: '📝' },
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  panel: PanelState
}

export default function FloatingPanel({ panel }: Props) {
  const { closePanel, focusPanel } = useToolbox()
  const dims = TOOL_DIMS[panel.tool] ?? DEFAULT_DIMS
  const { pos, onMouseDown } = useDraggable(panel.initialPosition, dims.w, dims.h)
  const meta = TOOL_META[panel.tool] ?? { label: panel.tool, emoji: '🔧' }

  return (
    <div
      onMouseDown={() => focusPanel(panel.id)}
      className="panel-in fixed flex flex-col rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
      style={{
        left:                 pos.x,
        top:                  pos.y,
        width:                dims.w,
        height:               dims.h,
        zIndex:               panel.zIndex,
        background:           'rgba(15, 23, 42, 0.92)',
        backdropFilter:       'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      }}
    >
      {/* ── Drag handle / header ── */}
      <div
        onMouseDown={onMouseDown}
        className="flex items-center justify-between px-4 py-2.5
                   cursor-grab active:cursor-grabbing select-none shrink-0"
        style={{
          background:   'rgba(255,255,255,0.04)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* macOS-style close dot */}
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => closePanel(panel.id)}
            aria-label="Close panel"
            className="w-3 h-3 rounded-full bg-white/15 hover:bg-red-500/90
                       transition-colors duration-150 shrink-0"
          />
          <span className="text-sm font-medium text-white/65 tracking-wide">
            {meta.emoji}&nbsp;&nbsp;{meta.label}
          </span>
        </div>
        <GripHorizontal size={14} className="text-white/20 shrink-0" />
      </div>

      {/* ── Tool content ── */}
      <div className="flex-1 overflow-hidden">
        {panel.tool === 'calculator' ? (
          <CalculatorPanel />
        ) : panel.tool === 'notes' ? (
          <NotesPanel />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 select-none">
            <span className="text-5xl opacity-20">{meta.emoji}</span>
            <p className="text-xs font-medium tracking-widest uppercase text-slate-600">Coming soon</p>
          </div>
        )}
      </div>
    </div>
  )
}
