import { useEffect, useState } from 'react'
import { Calculator, ChevronDown, ChevronUp, NotebookPen } from 'lucide-react'
import { useToolbox, type ToolId } from '../context/ToolboxContext'
import FloatingPanel from './FloatingPanel'

/**
 * Mouse must be within this many px from the bottom edge to reveal the collapsed handle.
 * Keep this larger than the reveal-handle height so the button stays in the hot zone
 * while the user moves the cursor up to click it.
 */
const BOTTOM_PROXIMITY = 120

export default function Toolbox() {
  const { toolbarCollapsed, setToolbarCollapsed, panels, openPanel } = useToolbox()
  const [nearBottom, setNearBottom] = useState(false)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      setNearBottom(window.innerHeight - e.clientY < BOTTOM_PROXIMITY)
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  const showToolbar = !toolbarCollapsed
  const showReveal  = toolbarCollapsed && nearBottom

  // Full-width fixed strip + flex justify-center is the most reliable way to
  // center a fixed element — avoids the left-1/2 / translateX(-50%) pitfall
  // that can be thrown off by scrollbar width or unknown element dimensions.
  const strip = 'fixed bottom-5 inset-x-0 z-[1500] flex justify-center'

  return (
    <>
      {/* ── Floating panels (always on top of everything) ── */}
      {panels.map(panel => (
        <FloatingPanel key={panel.id} panel={panel} />
      ))}

      {/* ── Collapsed reveal handle ───────────────────────────────────────── */}
      <div
        className={strip}
        style={{
          pointerEvents: 'none',
          opacity:   showReveal ? 1 : 0,
          transform: showReveal ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.18s ease, transform 0.18s ease',
        }}
      >
        <button
          onClick={() => setToolbarCollapsed(false)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full
                     border border-white/10 hover:border-white/20
                     text-white/40 hover:text-white/75
                     transition-all duration-200"
          style={{
            pointerEvents:        showReveal ? 'auto' : 'none',
            background:           'rgba(15,23,42,0.82)',
            backdropFilter:       'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <ChevronUp size={13} />
          <span className="text-xs font-medium tracking-wide">Tools</span>
        </button>
      </div>

      {/* ── Main toolbar pill ─────────────────────────────────────────────── */}
      <div
        className={strip}
        style={{
          pointerEvents: 'none',
          opacity:   showToolbar ? 1 : 0,
          transform: showToolbar ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.25s ease, transform 0.3s cubic-bezier(0.34,1.4,0.64,1)',
        }}
      >
        <div
          className="flex items-center gap-0.5 px-2 py-1.5 rounded-full border border-white/10 shadow-2xl"
          style={{
            pointerEvents:        showToolbar ? 'auto' : 'none',
            background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.95) 100%)',
            backdropFilter:       'blur(24px) saturate(160%)',
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
          }}
        >
          <ToolButton
            icon={<Calculator size={17} />}
            label="Calculator"
            tool="calculator"
            onClick={() => openPanel('calculator')}
            active={panels.some(p => p.id === 'calculator')}
          />

          <Divider />

          <ToolButton
            icon={<NotebookPen size={17} />}
            label="Notes"
            tool="notes"
            onClick={() => openPanel('notes')}
            active={panels.some(p => p.id === 'notes')}
          />

          <Divider />

          <button
            onClick={() => setToolbarCollapsed(true)}
            title="Hide toolbar"
            className="w-8 h-8 rounded-full flex items-center justify-center
                       text-white/25 hover:text-white/55 hover:bg-white/10
                       transition-all duration-200"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ToolButtonProps {
  icon:   React.ReactNode
  label:  string
  tool:   ToolId
  onClick: () => void
  active: boolean
}

function ToolButton({ icon, label, onClick, active }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative w-9 h-9 rounded-full flex items-center justify-center
                  transition-all duration-200
                  ${active
                    ? 'bg-indigo-600/50 text-indigo-200 shadow-inner'
                    : 'text-white/45 hover:text-white hover:bg-white/10'
                  }`}
    >
      {icon}
      {/* Active indicator dot */}
      {active && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-400" />
      )}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-4 bg-white/10 mx-1 shrink-0" />
}
