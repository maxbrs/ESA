import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { Note, NoteCreate, NoteUpdate } from '../types'

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setNotes(await api.getNotes())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createNote = async (data: NoteCreate): Promise<Note> => {
    const created = await api.createNote(data)
    setNotes(prev => [created, ...prev])   // newest first
    return created
  }

  const updateNote = async (id: string, data: NoteUpdate): Promise<Note> => {
    const updated = await api.updateNote(id, data)
    setNotes(prev => prev.map(n => n.id === id ? updated : n))
    return updated
  }

  const deleteNote = async (id: string): Promise<void> => {
    await api.deleteNote(id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  return { notes, loading, error, createNote, updateNote, deleteNote }
}
