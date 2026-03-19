'use client'

import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useState, useRef } from 'react'

const GYMS: Record<number, { name: string; type: string }> = {
  1: { name: 'Brock',     type: 'Rock' },
  2: { name: 'Misty',     type: 'Water' },
  3: { name: 'Lt. Surge', type: 'Electric' },
  4: { name: 'Erika',     type: 'Grass' },
  5: { name: 'Koga',      type: 'Poison' },
  6: { name: 'Sabrina',   type: 'Psychic' },
  7: { name: 'Blaine',    type: 'Fire' },
  8: { name: 'Giovanni',  type: 'Ground' },
}

// Locked gyms: gym_number → sequence_position (cannot be moved)
const LOCKED: Record<number, number> = { 1: 1, 2: 2, 8: 8 }
const LOCKED_POSITIONS = new Set([1, 2, 8]) // sequence positions that are locked

function buildInitialSlots(gymRows: { sequence_position: number; gym_number: number }[]): (number | null)[] {
  // slots[i] = gym_number at sequence_position i+1, or null
  const slots: (number | null)[] = Array(8).fill(null)
  // Set locked positions first
  for (const [gymNum, seqPos] of Object.entries(LOCKED)) {
    slots[Number(seqPos) - 1] = Number(gymNum)
  }
  // Fill from DB (skip locked)
  for (const row of gymRows) {
    if (!LOCKED_POSITIONS.has(row.sequence_position)) {
      slots[row.sequence_position - 1] = row.gym_number
    }
  }
  return slots
}

interface Props {
  runId: number
  gymRows: { sequence_position: number; gym_number: number }[]
  canEdit: boolean
}

export function GymOrder({ runId, gymRows, canEdit }: Props) {
  const [slots, setSlots] = useState<(number | null)[]>(() => buildInitialSlots(gymRows))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const dragging = useRef<{ gymNumber: number; fromSlot: number | null } | null>(null)

  const supabase = createSupabaseBrowser()

  // Gyms not yet placed in any non-locked slot
  const placedInSlots = new Set(
    slots
      .map((g, i) => (!LOCKED_POSITIONS.has(i + 1) ? g : null))
      .filter((g): g is number => g !== null)
  )
  const bank = Object.keys(GYMS)
    .map(Number)
    .filter((g) => !LOCKED[g] && !placedInSlots.has(g))

  function onDragStart(gymNumber: number, fromSlot: number | null) {
    dragging.current = { gymNumber, fromSlot }
  }

  function onDropSlot(seqPos: number) {
    if (!dragging.current) return
    const { gymNumber, fromSlot } = dragging.current
    dragging.current = null

    setSlots((prev) => {
      const next = [...prev]
      const targetIdx = seqPos - 1
      const displaced = next[targetIdx]

      // Place dragged gym in target slot
      next[targetIdx] = gymNumber

      // Clear the source slot (if dragged from a slot, not bank)
      if (fromSlot !== null) {
        next[fromSlot - 1] = displaced ?? null
      }

      return next
    })
  }

  function onDropBank() {
    if (!dragging.current) return
    const { gymNumber, fromSlot } = dragging.current
    dragging.current = null
    if (fromSlot === null) return // was already in bank

    setSlots((prev) => {
      const next = [...prev]
      next[fromSlot - 1] = null
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)

    // Build rows for non-locked, filled slots
    const rows = slots
      .map((gymNumber, i) => ({ sequence_position: i + 1, gym_number: gymNumber }))
      .filter((r): r is { sequence_position: number; gym_number: number } =>
        r.gym_number !== null && !LOCKED_POSITIONS.has(r.sequence_position)
      )

    // Delete existing non-locked rows, then insert current state
    const { error: delErr } = await supabase
      .from('run_gyms')
      .delete()
      .eq('run_id', runId)
      .not('sequence_position', 'in', `(${Object.values(LOCKED).join(',')})`)

    if (delErr) {
      setError(`Failed to save: ${delErr.message}`)
      setSaving(false)
      return
    }

    if (rows.length > 0) {
      const { error: insErr } = await supabase
        .from('run_gyms')
        .insert(rows.map((r) => ({ run_id: runId, ...r })))

      if (insErr) {
        setError(`Failed to save: ${insErr.message}`)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setSaved(true)
  }

  const allFilled = slots.every((g) => g !== null)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Gym Order</h2>
        {canEdit && (
          <button
            onClick={save}
            disabled={saving || !allFilled}
            title={!allFilled ? 'Fill all slots before saving' : undefined}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded px-3 py-2 text-red-300 text-sm mb-3">
          {error}
        </div>
      )}

      {/* Sequence slots */}
      <div className="flex gap-2 flex-wrap mb-4">
        {slots.map((gymNumber, i) => {
          const seqPos = i + 1
          const locked = LOCKED_POSITIONS.has(seqPos)
          const gym = gymNumber != null ? GYMS[gymNumber] : null

          return (
            <div key={seqPos} className="flex flex-col items-center gap-1">
              <span className="text-xs text-gray-500">{seqPos}</span>
              <div
                onDragOver={!locked && canEdit ? (e) => e.preventDefault() : undefined}
                onDrop={!locked && canEdit ? () => onDropSlot(seqPos) : undefined}
                className={`
                  w-20 h-16 rounded-lg border-2 flex flex-col items-center justify-center text-xs font-medium transition-colors
                  ${locked
                    ? 'border-gray-600 bg-gray-800/50 cursor-default'
                    : gym
                      ? 'border-blue-600 bg-blue-900/30 cursor-grab'
                      : 'border-dashed border-gray-600 bg-gray-900 text-gray-600'
                  }
                `}
                draggable={!locked && canEdit && gym != null}
                onDragStart={!locked && canEdit && gym != null
                  ? () => onDragStart(gymNumber!, seqPos)
                  : undefined}
              >
                {gym ? (
                  <>
                    <span className={locked ? 'text-gray-400' : 'text-blue-200'}>{gym.name}</span>
                    <span className="text-gray-500 text-[10px]">{gym.type}</span>
                  </>
                ) : (
                  <span>drop here</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bank of unplaced gyms */}
      {canEdit && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropBank}
          className={`
            min-h-[4rem] rounded-lg border border-dashed p-3 flex flex-wrap gap-2 items-center transition-colors
            ${bank.length === 0 ? 'border-gray-700 bg-transparent' : 'border-gray-600 bg-gray-900/50'}
          `}
        >
          {bank.length === 0 ? (
            <span className="text-xs text-gray-600">All gyms placed — drag here to remove</span>
          ) : (
            bank.map((gymNum) => (
              <div
                key={gymNum}
                draggable
                onDragStart={() => onDragStart(gymNum, null)}
                className="w-20 h-16 rounded-lg border border-gray-600 bg-gray-800 flex flex-col items-center justify-center text-xs font-medium cursor-grab hover:border-gray-400 transition-colors"
              >
                <span className="text-gray-200">{GYMS[gymNum].name}</span>
                <span className="text-gray-500 text-[10px]">{GYMS[gymNum].type}</span>
              </div>
            ))
          )}
        </div>
      )}

      {!canEdit && (
        <div className="text-sm text-gray-400">
          {allFilled
            ? slots.map((g, i) => GYMS[g!].name).join(' → ')
            : <span className="italic text-gray-600">Not entered</span>}
        </div>
      )}
    </section>
  )
}
