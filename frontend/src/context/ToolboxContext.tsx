import { createContext, useCallback, useContext, useState } from 'react'

export type ToolId = 'calculator' | 'notes'

export interface PanelState {
  id: string                          // equals tool name (one instance per tool)
  tool: ToolId
  initialPosition: { x: number; y: number }
  zIndex: number
}

interface ToolboxContextValue {
  toolbarCollapsed: boolean
  setToolbarCollapsed: (v: boolean) => void
  panels: PanelState[]
  openPanel: (tool: ToolId) => void
  closePanel: (id: string) => void
  focusPanel: (id: string) => void
}

const ToolboxContext = createContext<ToolboxContextValue | null>(null)

// Stagger initial positions so panels don't perfectly overlap
const INITIAL_OFFSETS: Record<ToolId, { dx: number; dy: number }> = {
  calculator: { dx: -200, dy: -60 },
  notes:      { dx:   40, dy: -90 },
}

let globalTopZ = 2000

export function ToolboxProvider({ children }: { children: React.ReactNode }) {
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false)
  const [panels, setPanels] = useState<PanelState[]>([])

  const openPanel = useCallback((tool: ToolId) => {
    setPanels(prev => {
      const existing = prev.find(p => p.id === tool)
      if (existing) {
        // already open → just bring to front
        globalTopZ++
        return prev.map(p => p.id === tool ? { ...p, zIndex: globalTopZ } : p)
      }
      globalTopZ++
      const { dx, dy } = INITIAL_OFFSETS[tool]
      return [
        ...prev,
        {
          id: tool,
          tool,
          initialPosition: {
            x: Math.round(window.innerWidth  / 2 + dx),
            y: Math.round(window.innerHeight / 2 + dy),
          },
          zIndex: globalTopZ,
        },
      ]
    })
  }, [])

  const closePanel = useCallback((id: string) => {
    setPanels(prev => prev.filter(p => p.id !== id))
  }, [])

  const focusPanel = useCallback((id: string) => {
    globalTopZ++
    setPanels(prev => prev.map(p => p.id === id ? { ...p, zIndex: globalTopZ } : p))
  }, [])

  return (
    <ToolboxContext.Provider
      value={{ toolbarCollapsed, setToolbarCollapsed, panels, openPanel, closePanel, focusPanel }}
    >
      {children}
    </ToolboxContext.Provider>
  )
}

export function useToolbox() {
  const ctx = useContext(ToolboxContext)
  if (!ctx) throw new Error('useToolbox must be used inside <ToolboxProvider>')
  return ctx
}
