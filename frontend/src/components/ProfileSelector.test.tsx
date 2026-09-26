import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import ProfileSelector from './ProfileSelector'
import * as hooks from '../hooks/useProfiles'

vi.mock('../hooks/useProfiles')

const mockProfiles = [
  { id: 'p1', name: 'Maxime', emoji: '🏄', updated_at: '' },
  { id: 'p2', name: 'Océane', emoji: '🌊', updated_at: '' },
]

beforeEach(() => {
  vi.mocked(hooks.useProfiles).mockReturnValue({
    profiles: mockProfiles,
    loading: false,
    error: null,
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
    reload: vi.fn(),
  })
})

function renderComponent() {
  return render(
    <AppProvider>
      <MemoryRouter>
        <ProfileSelector />
      </MemoryRouter>
    </AppProvider>
  )
}

it('renders all profile cards', () => {
  renderComponent()
  expect(screen.getByText('Maxime')).toBeInTheDocument()
  expect(screen.getByText('Océane')).toBeInTheDocument()
  expect(screen.getByText('🧔')).toBeInTheDocument()
})

it('shows + New profile button', () => {
  renderComponent()
  expect(screen.getByText(/new profile/i)).toBeInTheDocument()
})

it('opens create form on button click', async () => {
  renderComponent()
  await userEvent.click(screen.getByText(/new profile/i))
  expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument()
})
