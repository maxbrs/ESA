import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import AccountsList from './AccountsList'
import * as accountHooks from '../hooks/useAccounts'
import * as profileHooks from '../hooks/useProfiles'

vi.mock('../hooks/useAccounts')
vi.mock('../hooks/useProfiles')

const mockAccount = {
  id: 'a1', name: 'House', currency: 'NOK' as const, color: '#4A90D9',
  profile_weights: { p1: 0.5, p2: 0.5 }, updated_at: '',
}
const mockProfile = { id: 'p1', name: 'Maxime', emoji: '🧔', updated_at: '' }

beforeEach(() => {
  vi.mocked(accountHooks.useAccounts).mockReturnValue({
    accounts: [mockAccount], loading: false, error: null,
    createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn(), reload: vi.fn(),
  })
  vi.mocked(profileHooks.useProfiles).mockReturnValue({
    profiles: [mockProfile], loading: false, error: null,
    createProfile: vi.fn(), updateProfile: vi.fn(), deleteProfile: vi.fn(), reload: vi.fn(),
  })
})

function renderComponent() {
  const Wrapper = () => {
    return (
      <AppProvider>
        <MemoryRouter>
          <AccountsList />
        </MemoryRouter>
      </AppProvider>
    )
  }
  return render(<Wrapper />)
}

it('renders account card', () => {
  renderComponent()
  expect(screen.getByText('House')).toBeInTheDocument()
})

it('shows new account button', () => {
  renderComponent()
  expect(screen.getByText(/new account/i)).toBeInTheDocument()
})
