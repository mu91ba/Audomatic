import type { User } from '@supabase/supabase-js'

// Users are treated as 'owner' by default (backward compat for existing
// accounts with no metadata). Only explicitly-invited users get 'invitee'.
export function isInvitee(user: User | null | undefined): boolean {
  if (!user) return false
  return user.user_metadata?.role === 'invitee'
}

export function isFullAccount(user: User | null | undefined): boolean {
  return !!user && !isInvitee(user)
}
