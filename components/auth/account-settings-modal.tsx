'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Loader2 } from 'lucide-react'

interface AccountSettingsModalProps {
  onClose: () => void
}

export function AccountSettingsModal({ onClose }: AccountSettingsModalProps) {
  const { user } = useAuth()

  const initialName =
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split('@')[0] ||
    ''

  // Name form state
  const [name, setName] = useState(initialName)
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSuccess, setNameSuccess] = useState<string | null>(null)

  // Password form state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Name cannot be empty')
      return
    }
    setSavingName(true)
    setNameError(null)
    setNameSuccess(null)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { name: trimmed },
      })
      if (error) throw error
      setNameSuccess('Name updated')
    } catch (err: any) {
      setNameError(err?.message || 'Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setSavingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (error) throw error
      setPasswordSuccess('Password updated')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPasswordError(err?.message || 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Account Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Email (read-only) */}
        <div className="px-6 py-4 border-b">
          <p className="text-xs font-medium text-muted-foreground mb-1">Email</p>
          <p className="text-sm">{user?.email}</p>
        </div>

        {/* Display name */}
        <form onSubmit={handleSaveName} className="px-6 py-4 border-b">
          <label className="text-sm font-medium block mb-2">Display name</label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
            <Button type="submit" disabled={savingName || name.trim() === initialName}>
              {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
          {nameError && <p className="text-sm text-red-600 mt-2">{nameError}</p>}
          {nameSuccess && <p className="text-sm text-green-600 mt-2">{nameSuccess}</p>}
        </form>

        {/* Password */}
        <form onSubmit={handleSavePassword} className="px-6 py-4">
          <label className="text-sm font-medium block mb-2">Change password</label>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Button
              type="submit"
              disabled={savingPassword || !newPassword || !confirmPassword}
              className="w-full"
            >
              {savingPassword ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Update password'
              )}
            </Button>
          </div>
          {passwordError && <p className="text-sm text-red-600 mt-2">{passwordError}</p>}
          {passwordSuccess && (
            <p className="text-sm text-green-600 mt-2">{passwordSuccess}</p>
          )}
        </form>
      </div>
    </div>
  )
}
