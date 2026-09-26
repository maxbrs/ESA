import { useEffect, useRef, useState } from 'react'

/**
 * Returns drag state and a mouseDown handler for a draggable element.
 * `panelW` / `panelH` are used to clamp the position inside the viewport.
 */
export function useDraggable(
  initial: { x: number; y: number },
  panelW: number,
  panelH: number,
) {
  const [pos, setPos] = useState(initial)
  const dragging = useRef(false)
  const offset   = useRef({ x: 0, y: 0 })

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({
        x: Math.max(0, Math.min(e.clientX - offset.current.x, window.innerWidth  - panelW)),
        y: Math.max(0, Math.min(e.clientY - offset.current.y, window.innerHeight - panelH)),
      })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [panelW, panelH])

  return { pos, onMouseDown }
}
