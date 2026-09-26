/**
 * Thin wrapper around AppContext.
 * Profiles are fetched once in AppProvider and shared across all components;
 * calling this hook never triggers an independent API request.
 */
import { useAppContext } from '../context/AppContext'

export function useProfiles() {
  const { profiles, profilesLoading, createProfile, updateProfile, deleteProfile, reloadProfiles } =
    useAppContext()
  return {
    profiles,
    loading:       profilesLoading,
    error:         null,
    createProfile,
    updateProfile,
    deleteProfile,
    reload:        reloadProfiles,
  }
}
