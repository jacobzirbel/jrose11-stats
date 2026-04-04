'use client'

import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useState } from 'react'

interface Run {
  id: number
  status: string
  contributor_id: string | null
  pokemon: { name: string; dex_number: number; is_glitch: boolean }
}

interface Contributor {
  id: string
  username: string
}

const STATUS_COLORS: Record<string, string> = {
  stub: 'bg-gray-800 text-gray-400',
  in_progress: 'bg-blue-900/40 text-blue-300',
  needs_review: 'bg-yellow-900/40 text-yellow-300',
}

export function AssignManager({ runs: initialRuns, contributors }: { runs: Run[]; contributors: Contributor[] }) {
  const [runs, setRuns] = useState(initialRuns)
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const supabase = createSupabaseBrowser()

  function getSelected(run: Run) {
    return selected[run.id] ?? run.contributor_id ?? ''
  }

  async function assign(run: Run) {
    const contributorId = getSelected(run) || null
    setSaving(run.id)
    setError(null)

    const { error: err } = await supabase
      .from('runs')
      .update({
        contributor_id: contributorId,
        status: contributorId ? 'in_progress' : run.status === 'stub' ? 'stub' : run.status,
      })
      .eq('id', run.id)

    if (err) {
      setError(err.message)
    } else {
      setRuns(runs.map((r) =>
        r.id === run.id
          ? { ...r, contributor_id: contributorId, status: contributorId ? 'in_progress' : r.status }
          : r
      ))
    }
    setSaving(null)
  }

  async function closeRun(run: Run) {
    setSaving(run.id)
    setError(null)

    const { error: err } = await supabase
      .from('runs')
      .update({ status: 'complete' })
      .eq('id', run.id)

    if (err) {
      setError(err.message)
    } else {
      setRuns(runs.filter((r) => r.id !== run.id))
    }
    setSaving(null)
  }

  const needsReview = runs.filter((r) => r.status === 'needs_review')
  const assignable = runs.filter((r) => r.status !== 'needs_review')

  function RunRow({ run }: { run: Run }) {
    const p = run.pokemon
    const dexStr = p.is_glitch ? '#000' : `#${String(p.dex_number).padStart(3, '0')}`
    const displayName = p.name.charAt(0).toUpperCase() + p.name.slice(1).replace(/-/g, ' ')
    const isSaving = saving === run.id
    const assignedContributor = contributors.find((c) => c.id === run.contributor_id)

    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900">
        <div className="w-24 text-xs text-gray-500 shrink-0">{dexStr}</div>
        <div className="flex-1 text-sm font-medium">{displayName}</div>
        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${STATUS_COLORS[run.status] ?? 'bg-gray-800 text-gray-400'}`}>
          {run.status.replace('_', ' ')}
        </span>
        {run.status === 'needs_review' ? (
          <>
            <span className="text-xs text-gray-400 shrink-0">{assignedContributor?.username ?? '—'}</span>
            <button
              onClick={() => closeRun(run)}
              disabled={isSaving}
              className="text-xs px-3 py-1 rounded bg-green-900/40 hover:bg-green-800/60 text-green-300 transition-colors disabled:opacity-50 shrink-0"
            >
              {isSaving ? '...' : 'Close'}
            </button>
          </>
        ) : (
          <>
            <select
              value={getSelected(run)}
              onChange={(e) => setSelected((s) => ({ ...s, [run.id]: e.target.value }))}
              disabled={isSaving}
              className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
            >
              <option value="">— unassigned —</option>
              {contributors.map((c) => (
                <option key={c.id} value={c.id}>{c.username}</option>
              ))}
            </select>
            <button
              onClick={() => assign(run)}
              disabled={isSaving || getSelected(run) === (run.contributor_id ?? '')}
              className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-blue-900/40 hover:text-blue-300 text-gray-400 transition-colors disabled:opacity-50 shrink-0"
            >
              {isSaving ? '...' : 'Assign'}
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded px-4 py-2 text-red-300 text-sm">{error}</div>
      )}

      {needsReview.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-1">Needs Review</h2>
          <p className="text-sm text-gray-500 mb-4">Contributor marked these as done. Close to mark complete.</p>
          <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden">
            {needsReview.map((run) => <RunRow key={run.id} run={run} />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-1">Assign Runs</h2>
        <p className="text-sm text-gray-500 mb-4">Assign a contributor to a run to put it in progress.</p>
        {assignable.length === 0 ? (
          <p className="text-gray-600 text-sm italic">All runs assigned or complete</p>
        ) : (
          <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden">
            {assignable.map((run) => <RunRow key={run.id} run={run} />)}
          </div>
        )}
      </section>
    </div>
  )
}
