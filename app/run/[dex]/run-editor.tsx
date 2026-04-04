'use client'

import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useState } from 'react'

interface Move {
  move_id: number
  name: string
  used: boolean
}

interface CustomFieldValue {
  field_definition_id: number
  name: string
  field_type: 'boolean' | 'text' | 'number' | 'enum' | 'time'
  enum_options: string[] | null
  value: unknown
}

interface Props {
  runId: number
  moves: Move[]
  customFields: CustomFieldValue[]
  canEdit: boolean
  status: string
  canMarkDone: boolean
}


export function RunEditor({ runId, moves: initialMoves, customFields: initialCustomFields, canEdit, status: initialStatus, canMarkDone }: Props) {
  const [moves, setMoves] = useState(initialMoves)
  const [customFields, setCustomFields] = useState(initialCustomFields)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState(initialStatus)
  const [markingDone, setMarkingDone] = useState(false)

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
      setMoves(moves)
    }
    setSaving(null)
  }

  async function saveCustomField(defId: number, value: unknown) {
    if (!canEdit) return
    const prev = customFields
    setCustomFields(customFields.map((f) => f.field_definition_id === defId ? { ...f, value } : f))
    setSaving(`field-${defId}`)
    setError(null)

    const { error: err } = await supabase
      .from('custom_field_values')
      .upsert({ run_id: runId, field_definition_id: defId, value })

    if (err) {
      setError(`Failed to save: ${err.message}`)
      setCustomFields(prev)
    }
    setSaving(null)
  }

  async function markDone() {
    setMarkingDone(true)
    setError(null)
    const { error: err } = await supabase
      .from('runs')
      .update({ status: 'needs_review' })
      .eq('id', runId)
    if (err) {
      setError(err.message)
    } else {
      setStatus('needs_review')
    }
    setMarkingDone(false)
  }

  const [search, setSearch] = useState('')
  const usedMoves = moves.filter((m) => m.used)
  const unusedMoves = moves.filter((m) => !m.used).filter((m) =>
    search ? m.name.replace(/-/g, ' ').includes(search.toLowerCase()) : true
  )

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      {canMarkDone && status !== 'needs_review' && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-700">
          <span className="text-sm text-gray-400">When you&apos;re finished, mark this run as done for review.</span>
          <button
            onClick={markDone}
            disabled={markingDone}
            className="text-sm px-4 py-1.5 rounded bg-yellow-700/50 hover:bg-yellow-600/60 text-yellow-200 transition-colors disabled:opacity-50 shrink-0 ml-4"
          >
            {markingDone ? '...' : 'Mark done'}
          </button>
        </div>
      )}
      {status === 'needs_review' && canMarkDone && (
        <div className="px-4 py-3 rounded-lg bg-yellow-900/20 border border-yellow-800 text-sm text-yellow-300">
          Marked as done — awaiting admin review.
        </div>
      )}

      {customFields.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Details</h2>
          <div className="space-y-3">
            {customFields.map((f) => (
              <CustomFieldRow
                key={f.field_definition_id}
                field={f}
                canEdit={canEdit}
                saving={saving === `field-${f.field_definition_id}`}
                onChange={(val) => saveCustomField(f.field_definition_id, val)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Moves
          <span className="text-sm font-normal text-gray-400 ml-2">
            {moves.filter((m) => m.used).length} used / {moves.length} learnable
          </span>
        </h2>

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

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              {canEdit ? 'Click to mark as used' : 'Not used'}
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-36 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="h-40 overflow-y-auto rounded-lg bg-gray-900/50 border border-gray-800 p-2 flex flex-wrap gap-1.5 content-start">
            {unusedMoves.map((move) => (
              <MoveChip
                key={move.move_id}
                move={move}
                canEdit={canEdit}
                saving={saving === `move-${move.move_id}`}
                onClick={() => toggleMove(move.move_id)}
              />
            ))}
            {unusedMoves.length === 0 && (
              <span className="text-xs text-gray-600 italic">
                {search ? 'No matches' : 'All moves used'}
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// ---------------------
// CustomFieldRow
// ---------------------

function CustomFieldRow({
  field, canEdit, saving, onChange,
}: {
  field: CustomFieldValue
  canEdit: boolean
  saving: boolean
  onChange: (val: unknown) => void
}) {
  if (field.field_type === 'boolean') {
    const checked = field.value === true
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400 w-36">{field.name}</span>
        {canEdit ? (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              disabled={saving}
              onChange={(e) => onChange(e.target.checked)}
              className="rounded bg-gray-800 border-gray-600 w-4 h-4"
            />
            {saving && <span className="text-xs text-gray-500">Saving...</span>}
          </label>
        ) : (
          <span className="text-sm">{checked ? 'Yes' : 'No'}</span>
        )}
      </div>
    )
  }

  if (field.field_type === 'time') {
    return (
      <TimeFieldRow
        name={field.name}
        value={field.value as { seconds: number; estimated: boolean } | null}
        canEdit={canEdit}
        saving={saving}
        onChange={onChange}
      />
    )
  }

  if (field.field_type === 'number') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400 w-36">{field.name}</span>
        {canEdit ? (
          <input
            type="number"
            defaultValue={(field.value as number) ?? ''}
            onBlur={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            disabled={saving}
            className="w-24 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <span className="text-sm">{(field.value as number) ?? <span className="text-gray-600 italic">—</span>}</span>
        )}
      </div>
    )
  }

  if (field.field_type === 'enum' && field.enum_options) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400 w-36">{field.name}</span>
        {canEdit ? (
          <select
            defaultValue={(field.value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={saving}
            className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">—</option>
            {field.enum_options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm">{(field.value as string) ?? <span className="text-gray-600 italic">—</span>}</span>
        )}
      </div>
    )
  }

  // text
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-400 w-36">{field.name}</span>
      {canEdit ? (
        <input
          type="text"
          defaultValue={(field.value as string) ?? ''}
          onBlur={(e) => onChange(e.target.value || null)}
          disabled={saving}
          className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
      ) : (
        <span className="text-sm">{(field.value as string) ?? <span className="text-gray-600 italic">—</span>}</span>
      )}
    </div>
  )
}

function TimeFieldRow({
  name, value, canEdit, saving, onChange,
}: {
  name: string
  value: { seconds: number; estimated: boolean } | null
  canEdit: boolean
  saving: boolean
  onChange: (val: unknown) => void
}) {
  const initSeconds = value?.seconds ?? null
  const [minutes, setMinutes] = useState(initSeconds != null ? Math.floor(initSeconds / 60).toString() : '')
  const [secs, setSecs] = useState(initSeconds != null ? String(initSeconds % 60).padStart(2, '0') : '')
  const [estimated, setEstimated] = useState(value?.estimated ?? false)

  function handleSave() {
    if (minutes === '' && secs === '') {
      onChange(null)
    } else {
      const m = parseInt(minutes, 10) || 0
      const s = parseInt(secs, 10) || 0
      onChange({ seconds: m * 60 + s, estimated })
    }
  }

  if (!canEdit) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400 w-36">{name}</span>
        <span className="text-sm">
          {value?.seconds != null
            ? `${Math.floor(value.seconds / 60)}:${String(value.seconds % 60).padStart(2, '0')}${value.estimated ? ' (est.)' : ''}`
            : <span className="text-gray-600 italic">—</span>}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-400 w-36">{name}</span>
      <input
        type="number"
        min={0}
        placeholder="MM"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        className="w-16 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span className="text-gray-500">:</span>
      <input
        type="number"
        min={0}
        max={59}
        placeholder="SS"
        value={secs}
        onChange={(e) => setSecs(e.target.value)}
        className="w-16 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <label className="flex items-center gap-1.5 text-sm text-gray-400 ml-1">
        <input
          type="checkbox"
          checked={estimated}
          onChange={(e) => setEstimated(e.target.checked)}
          className="rounded bg-gray-800 border-gray-600"
        />
        Est.
      </label>
      <button
        onClick={handleSave}
        disabled={saving}
        className="ml-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded text-sm font-medium transition-colors"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}

// ---------------------
// MoveChip
// ---------------------

function MoveChip({ move, canEdit, saving, onClick }: { move: Move; canEdit: boolean; saving: boolean; onClick: () => void }) {
  const displayName = move.name.replace(/-/g, ' ')

  return (
    <button
      onClick={onClick}
      disabled={!canEdit || saving}
      className={`
        px-2 py-1 rounded text-xs font-medium transition-all
        ${move.used
          ? 'bg-green-900/50 text-green-300 border border-green-700'
          : 'bg-gray-800 text-gray-400 border border-transparent opacity-60 hover:opacity-100'
        }
        ${canEdit ? 'cursor-pointer' : 'cursor-default'}
        ${saving ? 'animate-pulse' : ''}
      `}
      title={displayName}
    >
      {displayName}
    </button>
  )
}
