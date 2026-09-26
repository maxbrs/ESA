import { describe, it, expect } from 'vitest'
import { computeBalance, formatBalance } from './balance'
import type { Transaction, Profile } from '../types'

const profiles: Profile[] = [
  { id: 'p1', name: 'Maxime', emoji: '🧔', updated_at: '' },
  { id: 'p2', name: 'Océane', emoji: '🌊', updated_at: '' },
]

describe('computeBalance', () => {
  it('returns zero for empty transactions', () => {
    const result = computeBalance([], profiles)
    expect(result).toEqual({ p1: 0, p2: 0 })
  })

  it('applies income 50-50', () => {
    const txns: Transaction[] = [{
      id: 't1', type: 'income', description: 'bonus', amount: 1000,
      date: '2026-09-20', created_by: 'p1',
      weights: { p1: 0.5, p2: 0.5 }, updated_at: '',
    }]
    const result = computeBalance(txns, profiles)
    expect(result.p1).toBeCloseTo(500)
    expect(result.p2).toBeCloseTo(500)
  })

  it('applies refill to creator only', () => {
    const txns: Transaction[] = [
      {
        id: 't1', type: 'income', description: '', amount: 1000,
        date: '2026-09-20', created_by: 'p1',
        weights: { p1: 0.5, p2: 0.5 }, updated_at: '',
      },
      {
        id: 't2', type: 'refill', description: '', amount: 1000,
        date: '2026-09-21', created_by: 'p1',
        weights: { p1: 1.0, p2: 0.0 }, updated_at: '',
      },
    ]
    const result = computeBalance(txns, profiles)
    expect(result.p1).toBeCloseTo(1500)
    expect(result.p2).toBeCloseTo(500)
  })

  it('matches spec example', () => {
    const txns: Transaction[] = [
      { id: 't1', type: 'income', description: '', amount: 1000, date: '', created_by: 'p1', weights: { p1: 0.5, p2: 0.5 }, updated_at: '' },
      { id: 't2', type: 'refill', description: '', amount: 1000, date: '', created_by: 'p1', weights: { p1: 1.0, p2: 0.0 }, updated_at: '' },
      { id: 't3', type: 'expense', description: '', amount: -200, date: '', created_by: 'p1', weights: { p1: 0.5, p2: 0.5 }, updated_at: '' },
    ]
    const result = computeBalance(txns, profiles)
    expect(result.p1).toBeCloseTo(1400)
    expect(result.p2).toBeCloseTo(400)
  })
})

describe('formatBalance', () => {
  it('formats positive NOK with + sign', () => {
    expect(formatBalance(1400, 'NOK')).toBe('+1 400,00 kr')
  })
  it('formats negative with - sign', () => {
    expect(formatBalance(-200, 'NOK')).toBe('-200,00 kr')
  })
})
