'use client'

import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type FieldType = 'boolean' | 'text' | 'number' | 'enum' | 'time'
type FieldStatus = 'active' | 'deprecated'

interface Field {
  id: number
  name: string
  field_type: FieldType
  description: string | null
  enum_options: string[] | null
  status: FieldStatus
}

const TYPE_LABELS: Record<FieldType, string> = {
  boolean: 'Boolean',
  text: 'Text',
  number: 'Number',
  enum: 'Enum',
  time: 'Time (MM:SS)',
}

export function FieldsManager({ fields: initialFields, isAdmin }: { fields: Field[]; isAdmin: boolean }) {
  const [fields, setFields] = useState(initialFields)
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createSupabaseBrowser()

  // Create form state
  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('boolean')
  const [description, setDescription] = useState('')
  const [enumOptions, setEnumOptions] = useState('') // comma-separated
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  async function createField() {
    if (!name.trim()) return
    setCreating(true)
    setCreateError(null)

    const payload: Record<string, unknown> = {
      name: name.trim(),
      field_type: fieldType,
      description: description.trim() || null,
      status: 'active',
    }

    if (fieldType === 'enum') {
      const opts = enumOptions.split(',').map((s) => s.trim()).filter(Boolean)
      if (opts.length < 2) {
        setCreateError('Enum fields need at least 2 options')
        setCreating(false)
        return
      }
      payload.enum_options = opts
    }

    const { data, error: err } = await supabase
      .from('custom_field_definitions')
      .insert(payload)
      .select('id, name, field_type, description, enum_options, status')
      .single()

    if (err) {
      setCreateError(err.message)
    } else {
      setFields([...fields, data as Field])
      setName('')
      setDescription('')
      setEnumOptions('')
      setFieldType('boolean')
    }
    setCreating(false)
  }

  async function setStatus(id: number, status: FieldStatus) {
    setSaving(id)
    setError(null)
    const { error: err } = await supabase
      .from('custom_field_definitions')
      .update({ status })
      .eq('id', id)
    if (err) {
      setError(err.message)
    } else {
      setFields(fields.map((f) => f.id === id ? { ...f, status } : f))
    }
    setSaving(null)
  }

  const activeFields = fields.filter((f) => f.status === 'active')
  const deprecatedFields = fields.filter((f) => f.status === 'deprecated')

  return (
    <div className="space-y-10">
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded px-4 py-2 text-red-300 text-sm">{error}</div>
      )}

      {/* Create form */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Add Custom Field</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Brock Finish"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value as FieldType)}
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description <span className="text-gray-600">(optional)</span></label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description shown on hover"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {fieldType === 'enum' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Options <span className="text-gray-600">(comma-separated)</span></label>
              <input
                type="text"
                value={enumOptions}
                onChange={(e) => setEnumOptions(e.target.value)}
                placeholder="S, A, B, C, D, F"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {createError && (
            <p className="text-red-400 text-sm">{createError}</p>
          )}

          <button
            onClick={createField}
            disabled={creating || !name.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            {creating ? 'Creating...' : 'Create Field'}
          </button>
        </div>
      </section>

      {/* Active fields */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Active Fields</h2>
        {activeFields.length === 0 ? (
          <p className="text-gray-600 text-sm italic">No active fields</p>
        ) : (
          <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden">
            {activeFields.map((f) => (
              <FieldRow
                key={f.id}
                field={f}
                isAdmin={isAdmin}
                saving={saving === f.id}
                onDeprecate={() => setStatus(f.id, 'deprecated')}
              />
            ))}
          </div>
        )}
      </section>

      {/* Deprecated fields */}
      {deprecatedFields.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4 text-gray-500">Deprecated Fields</h2>
          <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden opacity-60">
            {deprecatedFields.map((f) => (
              <FieldRow
                key={f.id}
                field={f}
                isAdmin={isAdmin}
                saving={saving === f.id}
                onRestore={isAdmin ? () => setStatus(f.id, 'active') : undefined}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FieldRow({
  field, isAdmin, saving, onDeprecate, onRestore,
}: {
  field: Field
  isAdmin: boolean
  saving: boolean
  onDeprecate?: () => void
  onRestore?: () => void
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-gray-900">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{field.name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
            {TYPE_LABELS[field.field_type]}
          </span>
          {field.field_type === 'enum' && field.enum_options && (
            <span className="text-xs text-gray-500">{field.enum_options.join(', ')}</span>
          )}
        </div>
        {field.description && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{field.description}</p>
        )}
      </div>

      {isAdmin && (
        <div>
          {onDeprecate && (
            <button
              onClick={onDeprecate}
              disabled={saving}
              className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-red-900/40 hover:text-red-300 text-gray-400 transition-colors disabled:opacity-50"
            >
              {saving ? '...' : 'Deprecate'}
            </button>
          )}
          {onRestore && (
            <button
              onClick={onRestore}
              disabled={saving}
              className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-green-900/40 hover:text-green-300 text-gray-400 transition-colors disabled:opacity-50"
            >
              {saving ? '...' : 'Restore'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
