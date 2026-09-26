import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import WeightsEditor from './WeightsEditor'

const profiles = [
  { id: 'p1', name: 'Maxime', emoji: '🧔', updated_at: '' },
  { id: 'p2', name: 'Océane', emoji: '🌊', updated_at: '' },
]

describe('WeightsEditor', () => {
  it('shows valid sum indicator', () => {
    render(
      <WeightsEditor
        profileIds={['p1', 'p2']}
        profiles={profiles}
        weights={{ p1: 0.5, p2: 0.5 }}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText(/1\.000/)).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('shows error for invalid sum', () => {
    render(
      <WeightsEditor
        profileIds={['p1', 'p2']}
        profiles={profiles}
        weights={{ p1: 0.4, p2: 0.4 }}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText(/≠ 1/)).toBeInTheDocument()
  })
})
