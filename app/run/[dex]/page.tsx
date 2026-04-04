import { createSupabaseServer } from '@/lib/supabase-server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RunEditor } from './run-editor'
import { GymOrder } from './gym-order'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ dex: string }>
}

export default async function RunPage({ params }: Props) {
  const { dex } = await params
  const dexNumber = parseInt(dex, 10)
  if (isNaN(dexNumber) || dexNumber < 0 || dexNumber > 151) notFound()

  const supabase = await createSupabaseServer()

  const { data: run } = await supabase
    .from('runs')
    .select('*, pokemon(dex_number, name, sprite_url, type1, type2, is_glitch)')
    .eq('pokemon_id', dexNumber)
    .single()

  if (!run) notFound()

  const [
    { data: runMoves },
    { data: customFieldValues },
    { data: allActiveFields },
    { data: runGyms },
  ] = await Promise.all([
    supabase
      .from('run_moves')
      .select('move_id, used, moves(name)')
      .eq('run_id', run.id)
      .order('move_id'),
    supabase
      .from('custom_field_values')
      .select('field_definition_id, value')
      .eq('run_id', run.id),
    supabase
      .from('custom_field_definitions')
      .select('id, name, field_type, enum_options')
      .eq('status', 'active')
      .order('id'),
    supabase
      .from('run_gyms')
      .select('sequence_position, gym_number')
      .eq('run_id', run.id)
      .order('sequence_position'),
  ])

  const { data: { user } } = await supabase.auth.getUser()
  let canEdit = false
  let canMarkDone = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile) {
      canEdit = ['contributor', 'admin'].includes(profile.role)
      canMarkDone = canEdit && run.status !== 'complete' && run.contributor_id === user.id
    }
  }

  const pokemon = run.pokemon as any
  const displayName = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1).replace(/-/g, ' ')
  const dexStr = pokemon.is_glitch ? '#000' : `#${String(pokemon.dex_number).padStart(3, '0')}`

  const moves = (runMoves ?? []).map((rm: any) => ({
    move_id: rm.move_id as number,
    name: rm.moves.name as string,
    used: rm.used as boolean,
  }))

  const valuesByFieldId = Object.fromEntries(
    (customFieldValues ?? []).map((v: any) => [v.field_definition_id, v.value])
  )

  const customFields = (allActiveFields ?? []).map((f: any) => ({
    field_definition_id: f.id as number,
    name: f.name as string,
    field_type: f.field_type as 'boolean' | 'text' | 'number' | 'enum' | 'time',
    enum_options: f.enum_options as string[] | null,
    value: valuesByFieldId[f.id] ?? null,
  }))

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/" className="text-gray-400 hover:text-white text-sm mb-4 inline-block">
        &larr; Back to overview
      </Link>

      <div className="flex items-center gap-4 mb-6">
        {pokemon.sprite_url ? (
          <img src={pokemon.sprite_url} alt={pokemon.name} width={96} height={96} className="pixelated" />
        ) : (
          <div className="w-24 h-24 bg-gray-800 rounded-lg flex items-center justify-center text-gray-600 text-2xl">?</div>
        )}
        <div>
          <h1 className="text-3xl font-bold">{displayName}</h1>
          <div className="text-gray-400">{dexStr} &middot; {pokemon.type1}{pokemon.type2 ? ` / ${pokemon.type2}` : ''}</div>
          <div className="mt-1">
            <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300">{run.status.replace('_', ' ')}</span>
            {pokemon.is_glitch && <span className="text-xs px-2 py-0.5 rounded bg-purple-900 text-purple-300 ml-2">glitch</span>}
          </div>
        </div>
      </div>

      {run.youtube_url && (
        <div className="mb-6">
          <a href={run.youtube_url} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:text-red-300">
            Watch on YouTube &rarr;
          </a>
        </div>
      )}

      {!canEdit && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-gray-800/50 border border-gray-700 text-sm text-gray-400">
          You are not a contributor, so there isn&apos;t much to see or do here. Check back later!
        </div>
      )}

      <div className="space-y-8">
        <GymOrder
          runId={run.id}
          gymRows={runGyms ?? []}
          canEdit={canEdit}
        />
        <RunEditor
          runId={run.id}
          moves={moves}
          customFields={customFields}
          canEdit={canEdit}
          status={run.status}
          canMarkDone={canMarkDone}
        />
      </div>
    </main>
  )
}
