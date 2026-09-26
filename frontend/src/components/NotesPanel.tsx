import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useNotes } from '../hooks/useNotes'
import { useAccounts } from '../hooks/useAccounts'
import { api } from '../api/client'
import type { Note } from '../types'

// ── Bullet renderer ────────────────────────────────────────────────────────

function renderContent(text: string): React.ReactNode {
  if (!text.trim()) {
    return <p className="text-white/20 text-sm italic select-none">Start writing…</p>
  }
  return (
    <div className="space-y-0.5 text-sm leading-relaxed">
      {text.split('\n').map((line, i) => {
        // 4-space indent bullet
        const deep = line.match(/^(\s{4,})-\s?(.*)/)
        if (deep) return (
          <div key={i} className="flex gap-2 ml-8">
            <span className="text-white/20 shrink-0 mt-0.5 select-none">▸</span>
            <span className="text-white/60">{deep[2]}</span>
          </div>
        )
        // 2-space indent bullet
        const mid = line.match(/^(\s{2,})-\s?(.*)/)
        if (mid) return (
          <div key={i} className="flex gap-2 ml-4">
            <span className="text-white/25 shrink-0 mt-0.5 select-none">◦</span>
            <span className="text-white/70">{mid[2]}</span>
          </div>
        )
        // Top-level bullet
        const top = line.match(/^-\s?(.*)/)
        if (top) return (
          <div key={i} className="flex gap-2">
            <span className="text-white/35 shrink-0 mt-0.5 select-none">•</span>
            <span className="text-white/80">{top[1]}</span>
          </div>
        )
        // Empty line
        if (!line.trim()) return <div key={i} className="h-1.5" />
        // Plain text
        return <div key={i} className="text-white/75">{line}</div>
      })}
    </div>
  )
}

// ── Save-state indicator ───────────────────────────────────────────────────

type SaveState = 'idle' | 'pending' | 'saving' | 'saved'

// ── Main component ─────────────────────────────────────────────────────────

export default function NotesPanel() {
  const { notes, loading, createNote, updateNote, deleteNote } = useNotes()
  const { accounts } = useAccounts()

  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [localTitle, setLocalTitle]   = useState('')
  const [localContent, setLocalContent] = useState('')
  const [localAccountId, setLocalAccountId] = useState<string | null>(null)
  const [isEditing, setIsEditing]     = useState(false)
  const [saveState, setSaveState]     = useState<SaveState>('idle')

  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const pendingCursor  = useRef<number | null>(null)
  const saveTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track the "dirty" values so the debounced callback always has fresh data
  const dirtyRef       = useRef({ title: '', content: '', accountId: null as string | null })
  // Mirror of selectedId in a ref so async save callbacks can check if we've
  // navigated away before updating the save-state indicator.
  const selectedIdRef  = useRef<string | null>(selectedId)
  // Mirror of saveState in a ref so the unmount cleanup can read the current
  // value (useEffect cleanup closures capture stale values from initial render).
  const saveStateRef   = useRef<SaveState>('idle')

  const selectedNote = notes.find(n => n.id === selectedId) ?? null

  // Auto-select first note when list loads
  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id)
  }, [notes, selectedId])

  // Keep refs in sync so async callbacks and the unmount cleanup always see
  // the latest values regardless of closure staleness.
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { saveStateRef.current  = saveState  }, [saveState])

  // On unmount (panel closed): flush any pending save so no edits are lost.
  // fetch requests sent here continue in-flight even after the component
  // is removed — React does not cancel them.
  useEffect(() => {
    return () => {
      if (saveStateRef.current === 'pending' && selectedIdRef.current) {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        // Call the API directly (no state updates needed — component is gone)
        api.updateNote(selectedIdRef.current, {
          title:      dirtyRef.current.title,
          content:    dirtyRef.current.content,
          account_id: dirtyRef.current.accountId,
        })
      }
    }
  }, []) // empty deps: runs exactly once, on unmount

  // Sync local state when the selected note changes (note switch, not on every server update)
  useEffect(() => {
    if (selectedNote) {
      setLocalTitle(selectedNote.title)
      setLocalContent(selectedNote.content)
      setLocalAccountId(selectedNote.account_id)
      dirtyRef.current = { title: selectedNote.title, content: selectedNote.content, accountId: selectedNote.account_id }
    }
    setIsEditing(false)
    setSaveState('idle')
    if (saveTimer.current) clearTimeout(saveTimer.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // Restore cursor position after React re-renders (needed after Tab/Enter manipulation)
  useLayoutEffect(() => {
    if (pendingCursor.current !== null && textareaRef.current) {
      const pos = pendingCursor.current
      textareaRef.current.selectionStart = pos
      textareaRef.current.selectionEnd   = pos
      pendingCursor.current = null
    }
  })

  // ── Auto-save ─────────────────────────────────────────────────────────────

  async function executeSave(noteId: string) {
    // Only show 'saving' if we're still on this note
    if (selectedIdRef.current === noteId) setSaveState('saving')
    try {
      await updateNote(noteId, {
        title:      dirtyRef.current.title,
        content:    dirtyRef.current.content,
        account_id: dirtyRef.current.accountId,
      })
      // Guard: don't flash '✓ Saved' on a different note if the user has switched
      if (selectedIdRef.current === noteId) {
        setSaveState('saved')
        setTimeout(() => {
          if (selectedIdRef.current === noteId) setSaveState('idle')
        }, 2000)
      }
    } catch {
      if (selectedIdRef.current === noteId) setSaveState('idle')
    }
  }

  function scheduleSave(noteId: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('pending')
    saveTimer.current = setTimeout(() => executeSave(noteId), 10_000)
  }

  async function forceSave() {
    if (!selectedId || saveState === 'saving') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await executeSave(selectedId)
  }

  /** Switch to a different note, flushing any pending save first. */
  function handleSelectNote(noteId: string) {
    if (noteId === selectedId) return
    // If there are unsaved changes, fire the save immediately (fire-and-forget;
    // dirtyRef values are captured synchronously before the first await).
    if (saveState === 'pending' && selectedId) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      executeSave(selectedId)
    }
    setSelectedId(noteId)
  }

  function handleTitleChange(value: string) {
    setLocalTitle(value)
    dirtyRef.current.title = value
    if (selectedId) scheduleSave(selectedId)
  }

  function handleContentChange(value: string) {
    setLocalContent(value)
    dirtyRef.current.content = value
    if (selectedId) scheduleSave(selectedId)
  }

  function handleAccountChange(value: string) {
    const id = value || null
    setLocalAccountId(id)
    dirtyRef.current.accountId = id
    if (selectedId) scheduleSave(selectedId)
  }

  // ── Smart bullet keyboard handling ─────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = textareaRef.current
    if (!ta) return

    if (e.key === 'Tab') {
      e.preventDefault()
      const start    = ta.selectionStart
      const val      = ta.value
      const lineStart = val.lastIndexOf('\n', start - 1) + 1

      if (e.shiftKey) {
        // Unindent: remove 2 leading spaces from current line
        if (val.slice(lineStart, lineStart + 2) === '  ') {
          const newVal = val.slice(0, lineStart) + val.slice(lineStart + 2)
          handleContentChange(newVal)
          pendingCursor.current = Math.max(lineStart, start - 2)
        }
      } else {
        // Indent: add 2 spaces at the start of the current line
        const newVal = val.slice(0, lineStart) + '  ' + val.slice(lineStart)
        handleContentChange(newVal)
        pendingCursor.current = start + 2
      }
      return
    }

    if (e.key === 'Enter') {
      const start          = ta.selectionStart
      const val            = ta.value
      const lineStart      = val.lastIndexOf('\n', start - 1) + 1
      const lineBeforeCursor = val.slice(lineStart, start)
      const bulletMatch    = lineBeforeCursor.match(/^(\s*- )/)

      if (bulletMatch) {
        e.preventDefault()
        const prefix  = bulletMatch[0]
        const content = lineBeforeCursor.slice(prefix.length)

        if (!content.trim()) {
          // Empty bullet → exit list, remove the prefix
          const newVal = val.slice(0, lineStart) + '\n' + val.slice(start)
          handleContentChange(newVal)
          pendingCursor.current = lineStart + 1
        } else {
          // Non-empty bullet → continue on next line with same prefix
          const newVal = val.slice(0, start) + '\n' + prefix + val.slice(start)
          handleContentChange(newVal)
          pendingCursor.current = start + 1 + prefix.length
        }
      }
    }
  }

  // ── Note CRUD actions ──────────────────────────────────────────────────────

  async function handleNewNote() {
    const note = await createNote({ title: 'New note', content: '' })
    setSelectedId(note.id)
    // Small delay so the note list renders, then focus the title
    setTimeout(() => {
      const titleEl = document.getElementById('note-title-input')
      if (titleEl) (titleEl as HTMLInputElement).select()
    }, 80)
  }

  async function handleDeleteNote(note: Note, e: React.MouseEvent) {
    e.stopPropagation()
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await deleteNote(note.id)
    setSelectedId(prev => {
      if (prev !== note.id) return prev
      const remaining = notes.filter(n => n.id !== note.id)
      return remaining[0]?.id ?? null
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left sidebar — note list ── */}
      <div
        className="flex flex-col shrink-0 overflow-hidden border-r border-white/[0.07]"
        style={{ width: 168 }}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-2.5 shrink-0 border-b border-white/[0.06]">
          <span className="text-[11px] font-semibold text-white/35 uppercase tracking-wider">Notes</span>
          <button
            onClick={handleNewNote}
            title="New note"
            className="w-6 h-6 rounded-full flex items-center justify-center
                       text-white/30 hover:text-white/70 hover:bg-white/10 transition-all"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-y-auto py-1">
          {loading && (
            <p className="text-center text-white/20 text-xs py-6">Loading…</p>
          )}
          {!loading && notes.length === 0 && (
            <p className="text-center text-white/20 text-xs py-6">No notes yet</p>
          )}
          {notes.map(note => {
            const linked = accounts.find(a => a.id === note.account_id)
            const isSelected = note.id === selectedId
            return (
              <button
                key={note.id}
                onClick={() => handleSelectNote(note.id)}
                className={`group relative w-full text-left px-3 py-2.5 transition-colors
                  ${isSelected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}
              >
                {/* Account badge */}
                {linked && (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: linked.color }} />
                    <span className="text-[10px] text-white/30 font-medium truncate">{linked.name}</span>
                  </div>
                )}
                <p className={`text-xs font-medium truncate leading-snug
                  ${isSelected ? 'text-white/85' : 'text-white/55'}`}>
                  {note.title || <span className="italic text-white/25">Untitled</span>}
                </p>

                {/* Delete button — visible on hover */}
                <span
                  role="button"
                  onClick={(e) => handleDeleteNote(note, e)}
                  title="Delete note"
                  className="absolute right-2 top-1/2 -translate-y-1/2
                             opacity-0 group-hover:opacity-100
                             text-white/20 hover:text-red-400/80
                             transition-all p-0.5 rounded"
                >
                  <Trash2 size={11} />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right — editor ── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {selectedNote === null ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-white/20 italic select-none">
              {notes.length === 0 ? 'Create a note to get started' : 'Select a note'}
            </p>
          </div>
        ) : (
          <>
            {/* Title + account + save indicator */}
            <div className="shrink-0 px-4 pt-3 pb-2 border-b border-white/[0.06] space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id="note-title-input"
                  type="text"
                  value={localTitle}
                  onChange={e => handleTitleChange(e.target.value)}
                  placeholder="Note title"
                  className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-white/85
                             placeholder-white/20 outline-none"
                />
                {/* Save button — doubles as state indicator */}
                <button
                  onClick={forceSave}
                  disabled={saveState === 'saving'}
                  title="Save note"
                  className={`flex items-center gap-1 shrink-0 px-2 py-1 rounded text-[11px]
                              font-medium transition-all duration-200
                              ${saveState === 'saving'
                                ? 'text-white/35 cursor-default'
                                : saveState === 'saved'
                                ? 'text-emerald-400/80'
                                : saveState === 'pending'
                                ? 'text-white/75 bg-white/[0.08] hover:bg-white/[0.12]'
                                : 'text-white/25 hover:text-white/50'}`}
                >
                  {saveState === 'saving' ? (
                    'Saving…'
                  ) : saveState === 'saved' ? (
                    '✓ Saved'
                  ) : (
                    <><Save size={11} />&nbsp;Save</>
                  )}
                </button>
              </div>

              {/* Account selector */}
              <select
                value={localAccountId ?? ''}
                onChange={e => handleAccountChange(e.target.value)}
                className="w-full bg-transparent text-[11px] text-white/35 outline-none
                           hover:text-white/55 transition-colors cursor-pointer"
              >
                <option value="">No account linked</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {/* Content area — blur-to-render */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {isEditing ? (
                <textarea
                  ref={textareaRef}
                  value={localContent}
                  onChange={e => handleContentChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => setIsEditing(false)}
                  placeholder={"- Main point\n  - Sub-detail\nOr just plain text…"}
                  spellCheck
                  autoFocus
                  className="w-full h-full min-h-full resize-none bg-transparent
                             text-sm text-white/75 leading-relaxed
                             placeholder-white/15 outline-none font-[inherit]"
                />
              ) : (
                <div
                  className="w-full h-full min-h-[80px] cursor-text"
                  onClick={() => setIsEditing(true)}
                >
                  {renderContent(localContent)}
                </div>
              )}
            </div>
          </>
        )}
      </div>

    </div>
  )
}
