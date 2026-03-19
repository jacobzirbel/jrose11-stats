'use client'

import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useState } from 'react'

type Role = 'account' | 'contributor' | 'admin'

interface User {
  id: string
  username: string
  role: Role
  created_at: string
}

interface Run {
  id: number
  status: string
  pokemon: { name: string; dex_number: number; is_glitch: boolean }
}

const ROLE_LABELS: Record<Role, string> = {
  account: 'Account',
  contributor: 'Contributor',
  admin: 'Admin',
}

const ROLE_COLORS: Record<Role, string> = {
  account: 'bg-gray-800 text-gray-400',
  contributor: 'bg-blue-900/40 text-blue-300',
  admin: 'bg-purple-900/40 text-purple-300',
}

export function AdminManager({ users: initialUsers, completeRuns: initialRuns }: { users: User[]; completeRuns: Run[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [runs, setRuns] = useState(initialRuns)
  const [savingUser, setSavingUser] = useState<string | null>(null)
  const [savingRun, setSavingRun] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const supabase = createSupabaseBrowser()

  async function toggleContributor(user: User) {
    const newRole: Role = user.role === 'contributor' ? 'account' : 'contributor'
    setSavingUser(user.id)
    setError(null)

    const { error: err } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', user.id)

    if (err) {
      setError(err.message)
    } else {
      setUsers(users.map((u) => u.id === user.id ? { ...u, role: newRole } : u))
    }
    setSavingUser(null)
  }

  async function unlockRun(run: Run) {
    setSavingRun(run.id)
    setError(null)

    const { error: err } = await supabase
      .from('runs')
      .update({ status: 'in_progress' })
      .eq('id', run.id)

    if (err) {
      setError(err.message)
    } else {
      setRuns(runs.filter((r) => r.id !== run.id))
    }
    setSavingRun(null)
  }

  return (
    <div className="space-y-10">
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded px-4 py-2 text-red-300 text-sm">{error}</div>
      )}

      {/* Users */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Users</h2>
        <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden">
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-4 px-4 py-3 bg-gray-900">
              <div className="flex-1">
                <span className="font-medium text-sm">{user.username}</span>
                <span className="text-xs text-gray-500 ml-2">
                  joined {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${ROLE_COLORS[user.role]}`}>
                {ROLE_LABELS[user.role]}
              </span>
              {user.role !== 'admin' && (
                <button
                  onClick={() => toggleContributor(user)}
                  disabled={savingUser === user.id}
                  className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-50 min-w-[7rem]"
                >
                  {savingUser === user.id
                    ? '...'
                    : user.role === 'contributor'
                      ? 'Remove contributor'
                      : 'Make contributor'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Unlock completed runs */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Completed Runs</h2>
        <p className="text-sm text-gray-500 mb-4">Unlock a run to allow contributors to edit it again.</p>
        {runs.length === 0 ? (
          <p className="text-gray-600 text-sm italic">No completed runs</p>
        ) : (
          <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden">
            {runs.map((run) => {
              const p = run.pokemon
              const dexStr = p.is_glitch ? '#000' : `#${String(p.dex_number).padStart(3, '0')}`
              const displayName = p.name.charAt(0).toUpperCase() + p.name.slice(1).replace(/-/g, ' ')
              return (
                <div key={run.id} className="flex items-center gap-4 px-4 py-3 bg-gray-900">
                  <div className="flex-1 text-sm">
                    <span className="text-gray-400 mr-2">{dexStr}</span>
                    <span className="font-medium">{displayName}</span>
                  </div>
                  <button
                    onClick={() => unlockRun(run)}
                    disabled={savingRun === run.id}
                    className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-yellow-900/40 hover:text-yellow-300 text-gray-400 transition-colors disabled:opacity-50"
                  >
                    {savingRun === run.id ? '...' : 'Unlock'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
