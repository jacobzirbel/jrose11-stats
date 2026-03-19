import { createSupabaseServer } from '@/lib/supabase-server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RunEditor } from './run-editor'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ dex: string }>
}

export default async function RunPage({ params }: Props) {
  const { dex } = await params
  const dexNumber = parseInt(dex, 10)
  if (isNaN(dexNumber) || dexNumber < 0 || dexNumber > 151) notFound()

  const supabase = await createSupabaseServer()

  // Fetch run + pokemon
  const { data: run } = await supabase
    .from('runs')
    .select('*, pokemon(dex_number, name, sprite_url, type1, type2, is_glitch)')
    .eq('pokemon_id', dexNumber)
    .single()

  if (!run) notFound()

  // Fetch moves for this run (joined with move names)
  const { data: runMoves } = await supabase
    .from('run_moves')
    .select('move_id, used, moves(name, category)')
    .eq('run_id', run.id)
    .order('move_id')

  // Check if current user can edit
  const { data: { user } } = await supabase.auth.getUser()
  let canEdit = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile) {
      canEdit = ['contributor', 'trusted_contributor', 'admin'].includes(profile.role)
    }
  }

  const pokemon = run.pokemon as any
  const displayName = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1).replace(/-/g, ' ')
  const dexStr = pokemon.is_glitch ? '#000' : `#${String(pokemon.dex_number).padStart(3, '0')}`

  const moves = (runMoves ?? []).map((rm: any) => ({
    move_id: rm.move_id as number,
    name: rm.moves.name as string,
    category: rm.moves.category as string | null,
    used: rm.used as boolean,
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

      <RunEditor
        runId={run.id}
        brockFinishSeconds={run.brock_finish_seconds}
        brockTimeEstimated={run.brock_time_estimated}
        moves={moves}
        canEdit={canEdit}
      />
    </main>
  )
}
