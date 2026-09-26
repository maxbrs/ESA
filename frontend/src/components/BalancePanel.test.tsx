import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BalancePanel from './BalancePanel'

const profiles = [
  { id: 'p1', name: 'Maxime', emoji: '🏄', updated_at: '' },
  { id: 'p2', name: 'Océane', emoji: '🌊', updated_at: '' },
]

it('renders positive balance in green', () => {
  render(
    <BalancePanel
      profiles={profiles}
      balance={{ p1: 1400, p2: 400 }}
      currency="NOK"
    />
  )
  expect(screen.getByText('Maxime')).toBeInTheDocument()
  expect(screen.getByText(/1.400/)).toBeInTheDocument()  // nb-NO locale
})

it('renders zero balance as neutral', () => {
  render(
    <BalancePanel
      profiles={profiles}
      balance={{ p1: 0, p2: 0 }}
      currency="NOK"
    />
  )
  expect(screen.getByText('Océane')).toBeInTheDocument()
})
