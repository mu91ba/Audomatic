import type { User } from '@supabase/supabase-js'

/**
 * Roles live in the `app_users` table (migration 019), never in
 * auth.users.user_metadata. Metadata is writable by the account holder —
 * account-settings-modal.tsx writes to it — so a role kept there is a
 * suggestion, not a permission.
 *
 *   admin   approves applications; everything a member can do
 *   member  runs audits, owns and shares them
 *   viewer  reads only the audits shared with them
 */
export type AppRole = 'admin' | 'member' | 'viewer'

/** Unknown account, missing row, failed lookup: assume the least access. */
export const DEFAULT_ROLE: AppRole = 'viewer'

export function parseRole(value: unknown): AppRole {
  return value === 'admin' || value === 'member' || value === 'viewer'
    ? value
    : DEFAULT_ROLE
}

export function isAdmin(role: AppRole | null | undefined): boolean {
  return role === 'admin'
}

/** Mirrors can_create_audits() in the database. Keep the two in step. */
export function canCreateAudits(role: AppRole | null | undefined): boolean {
  return role === 'admin' || role === 'member'
}

/** Read-only account: sees shared audits and nothing else. */
export function isViewer(role: AppRole | null | undefined): boolean {
  return !role || role === 'viewer'
}

/**
 * Pre-019 accounts carried role='invitee' in user_metadata. Migration 019
 * backfills app_users, so this is only a display fallback for a session whose
 * app_users row has not loaded yet.
 */
export function hasLegacyInviteeMetadata(user: User | null | undefined): boolean {
  return user?.user_metadata?.role === 'invitee'
}
