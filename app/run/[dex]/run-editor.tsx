'use client'

import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useState } from 'react'

interface Move {
  move_id: number
  name: string
  category: string | null
  used: boolean
}

interface Props {
  runId: number
  brockFinishSeconds: number | null
  brockTimeEstimated: boolean
  moves: Move[]
  canEdit: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  physical: 'bg-red-900/30 text-red-300',
  special: 'bg-blue-900/30 text-blue-300',
  status: 'bg-gray-700/50 text-gray-300',
}

export function RunEditor({ runId, brockFinishSeconds, brockTimeEstimated, moves: initialMoves, canEdit }: Props) {
  const [moves, setMoves] = useState(initialMoves)
  const [brockMinutes, setBrockMinutes] = useState(brockFinishSeconds != null ? Math.floor(brockFinishSeconds / 60).toString() : '')
  const [brockSeconds, setBrockSeconds] = useState(brockFinishSeconds != null ? (brockFinishSeconds % 60).toString().padStart(2, '0') : '')
  const [estimated, setEstimated] = useState(brockTimeEstimated)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const supabase = createSupabaseBrowser()

  async function toggleMove(moveId: number) {
    if (!canEdit) return
    const move = moves.find((m) => m.move_id === moveId)
    if (!move) return

    const newUsed = !move.used
    setMoves(moves.map((m) => m.move_id === moveId ? { ...m, used: newUsed } : m))
    setSaving(`move-${moveId}`)
    setError(null)

    const { error: err } = await supabase
      .from('run_moves')
      .update({ used: newUsed })
      .eq('run_id', runId)
      .eq('move_id', moveId)

    if (err) {
      setError(`Failed to update move: ${err.message}`)
      setMoves(moves) // revert
    }
    setSaving(null)
  }

  async function saveBrockTime() {
    if (!canEdit) return
    setSaving('brock')
    setError(null)

    const mins = parseInt(brockMinutes, 10) || 0
    const secs = parseInt(brockSeconds, 10) || 0
    const totalSeconds = mins * 60 + secs

    if (totalSeconds === 0 && brockMinutes === '' && brockSeconds === '') {
      // Clear the field
      const { error: err } = await supabase
        .from('runs')
        .update({ brock_finish_seconds: null, brock_time_estimated: false })
        .eq('id', runId)

      if (err) setError(`Failed to save: ${err.message}`)
    } else {
      const { error: err } = await supabase
        .from('runs')
        .update({ brock_finish_seconds: totalSeconds, brock_time_estimated: estimated })
        .eq('id', runId)

      if (err) setError(`Failed to save: ${err.message}`)
    }
    setSaving(null)
  }

  const [search, setSearch] = useState('')
  const filtered = search
    ? moves.filter((m) => m.name.replace(/-/g, ' ').includes(search.toLowerCase()))
    : moves
  const usedMoves = filtered.filter((m) => m.used)
  const unusedMoves = filtered.filter((m) => !m.used)

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Brock Time */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Brock Finish Time</h2>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              placeholder="MM"
              value={brockMinutes}
              onChange={(e) => setBrockMinutes(e.target.value)}
              className="w-16 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-500">:</span>
            <input
              type="number"
              min={0}
              max={59}
              placeholder="SS"
              value={brockSeconds}
              onChange={(e) => setBrockSeconds(e.target.value)}
              className="w-16 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="flex items-center gap-1.5 text-sm text-gray-400 ml-2">
              <input
                type="checkbox"
                checked={estimated}
                onChange={(e) => setEstimated(e.target.checked)}
                className="rounded bg-gray-800 border-gray-600"
              />
              Estimated
            </label>
            <button
              onClick={saveBrockTime}
              disabled={saving === 'brock'}
              className="ml-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded text-sm font-medium transition-colors"
            >
              {saving === 'brock' ? 'Saving...' : 'Save'}
            </button>
          </div>
        ) : (
          <div className="bg-gray-800/50 rounded-lg p-3 text-sm">
            {brockFinishSeconds != null ? (
              <span>
                {Math.floor(brockFinishSeconds / 60)}:{String(brockFinishSeconds % 60).padStart(2, '0')}
                {brockTimeEstimated && <span className="text-gray-500 ml-1">(estimated)</span>}
              </span>
            ) : (
              <span className="text-gray-600 italic">Not set</span>
            )}
          </div>
        )}
      </section>

      {/* Moves */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            Moves
            <span className="text-sm font-normal text-gray-400 ml-2">
              {moves.filter((m) => m.used).length} used / {moves.length} learnable
            </span>
          </h2>
          <input
            type="text"
            placeholder="Search moves..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-40 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Used moves first */}
        {usedMoves.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Used</div>
            <div className="flex flex-wrap gap-2">
              {usedMoves.map((move) => (
                <MoveChip
                  key={move.move_id}
                  move={move}
                  canEdit={canEdit}
                  saving={saving === `move-${move.move_id}`}
                  onClick={() => toggleMove(move.move_id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Unused moves */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            {canEdit ? 'Click to mark as used' : 'Not used'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unusedMoves.map((move) => (
              <MoveChip
                key={move.move_id}
                move={move}
                canEdit={canEdit}
                saving={saving === `move-${move.move_id}`}
                onClick={() => toggleMove(move.move_id)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function MoveChip({ move, canEdit, saving, onClick }: { move: Move; canEdit: boolean; saving: boolean; onClick: () => void }) {
  const displayName = move.name.replace(/-/g, ' ')
  const categoryClass = CATEGORY_COLORS[move.category ?? ''] ?? 'bg-gray-800 text-gray-400'

  return (
    <button
      onClick={onClick}
      disabled={!canEdit || saving}
      className={`
        px-2 py-1 rounded text-xs font-medium transition-all
        ${move.used
          ? 'bg-green-900/50 text-green-300 border border-green-700'
          : `${categoryClass} border border-transparent opacity-60 hover:opacity-100`
        }
        ${canEdit ? 'cursor-pointer' : 'cursor-default'}
        ${saving ? 'animate-pulse' : ''}
      `}
      title={`${displayName}${move.category ? ` (${move.category})` : ''}`}
    >
      {displayName}
    </button>
  )
}
