'use client'

import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useState, useRef, useEffect } from 'react'

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

const LOCKED: Record<number, number> = { 1: 1, 2: 2, 8: 8 } // gym_number → sequence_position
const LOCKED_POSITIONS = new Set([1, 2, 8])
const SELECTABLE_GYMS = [3, 4, 5, 6, 7]

function buildInitialSlots(gymRows: { sequence_position: number; gym_number: number }[]): (number | null)[] {
  const slots: (number | null)[] = Array(8).fill(null)
  for (const [gymNum, seqPos] of Object.entries(LOCKED)) {
    slots[Number(seqPos) - 1] = Number(gymNum)
  }
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
  const [openSlot, setOpenSlot] = useState<number | null>(null) // sequence_position of open popup
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  // Close popup on outside click
  useEffect(() => {
    if (openSlot === null) return
    function handler(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpenSlot(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openSlot])

  function selectGym(seqPos: number, gymNumber: number) {
    setSlots((prev) => {
      const next = [...prev]
      next[seqPos - 1] = gymNumber
      return next
    })
    setOpenSlot(null)
    setSaved(false)
  }

  function clearSlot(seqPos: number) {
    setSlots((prev) => {
      const next = [...prev]
      next[seqPos - 1] = null
      return next
    })
    setSaved(false)
  }

  const unlockedSlots = slots.filter((_, i) => !LOCKED_POSITIONS.has(i + 1))
  const filledUnlocked = unlockedSlots.filter((g) => g !== null) as number[]
  const hasDuplicates = filledUnlocked.length !== new Set(filledUnlocked).size
  const hasEmpty = unlockedSlots.some((g) => g === null)
  const canSave = !hasEmpty && !hasDuplicates

  const saveDisabledReason = hasEmpty
    ? 'Fill all slots before saving'
    : hasDuplicates
      ? 'Remove duplicate gyms before saving'
      : undefined

  const supabase = createSupabaseBrowser()

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)

    const rows = slots
      .map((gymNumber, i) => ({ sequence_position: i + 1, gym_number: gymNumber }))
      .filter((r): r is { sequence_position: number; gym_number: number } =>
        r.gym_number !== null && !LOCKED_POSITIONS.has(r.sequence_position)
      )

    const { error: rpcErr } = await supabase.rpc('save_gym_order', {
      p_run_id: runId,
      p_gyms: rows,
    })

    if (rpcErr) { setError(`Failed to save: ${rpcErr.message}`); setSaving(false); return }

    setSaving(false)
    setSaved(true)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Gym Order</h2>
        {canEdit && (
          <button
            onClick={save}
            disabled={saving || !canSave}
            title={saveDisabledReason}
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

      {hasDuplicates && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded px-3 py-2 text-yellow-300 text-sm mb-3">
          Duplicate gyms — fix before saving
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {slots.map((gymNumber, i) => {
          const seqPos = i + 1
          const locked = LOCKED_POSITIONS.has(seqPos)
          const gym = gymNumber != null ? GYMS[gymNumber] : null
          const isOpen = openSlot === seqPos

          // Detect duplicate for this slot
          const isDuplicate = !locked && gymNumber !== null &&
            slots.some((g, j) => g === gymNumber && j !== i && !LOCKED_POSITIONS.has(j + 1))

          return (
            <div key={seqPos} className="flex flex-col items-center gap-1 relative">
              <span className="text-xs text-gray-500">{seqPos}</span>

              <button
                disabled={locked || !canEdit}
                onClick={() => {
                  if (locked || !canEdit) return
                  setOpenSlot(isOpen ? null : seqPos)
                }}
                className={`
                  w-20 h-16 rounded-lg border-2 flex flex-col items-center justify-center text-xs font-medium transition-colors
                  ${locked
                    ? 'border-gray-700 bg-gray-800/50 cursor-default text-gray-400'
                    : isDuplicate
                      ? 'border-red-600 bg-red-900/20 text-red-300 cursor-pointer hover:border-red-400'
                      : gym
                        ? 'border-blue-600 bg-blue-900/30 text-blue-200 cursor-pointer hover:border-blue-400'
                        : 'border-dashed border-gray-600 bg-gray-900 text-gray-600 cursor-pointer hover:border-gray-400'
                  }
                `}
              >
                {gym ? (
                  <>
                    <span>{gym.name}</span>
                    <span className="text-[10px] opacity-60">{gym.type}</span>
                  </>
                ) : (
                  <span>+</span>
                )}
              </button>

              {/* Popup */}
              {isOpen && (
                <div
                  ref={popupRef}
                  className="absolute top-full mt-1 left-0 z-10 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[8rem]"
                >
                  {SELECTABLE_GYMS.map((gNum) => (
                    <button
                      key={gNum}
                      onClick={() => selectGym(seqPos, gNum)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 transition-colors flex justify-between items-center gap-3"
                    >
                      <span>{GYMS[gNum].name}</span>
                      <span className="text-xs text-gray-500">{GYMS[gNum].type}</span>
                    </button>
                  ))}
                  {gymNumber !== null && (
                    <>
                      <div className="border-t border-gray-700 my-1" />
                      <button
                        onClick={() => { clearSlot(seqPos); setOpenSlot(null) }}
                        className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700 transition-colors"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!canEdit && (
        <div className="text-sm text-gray-400 mt-2">
          {!hasEmpty
            ? slots.map((g) => GYMS[g!].name).join(' → ')
            : <span className="italic text-gray-600">Not entered</span>}
        </div>
      )}
    </section>
  )
}
