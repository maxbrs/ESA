/**
 * Thin wrapper around AppContext.
 * Accounts are fetched once in AppProvider and shared across all components;
 * calling this hook never triggers an independent API request.
 */
import { useAppContext } from '../context/AppContext'

export function useAccounts() {
  const { accounts, accountsLoading, createAccount, updateAccount, deleteAccount, reloadAccounts } =
    useAppContext()
  return {
    accounts,
    loading:       accountsLoading,
    error:         null,
    createAccount,
    updateAccount,
    deleteAccount,
    reload:        reloadAccounts,
  }
}
