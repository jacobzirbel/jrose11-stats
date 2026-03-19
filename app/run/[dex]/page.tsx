import { createSupabaseServer } from '@/lib/supabase-server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

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

  const pokemon = run.pokemon as any
  const displayName = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1).replace(/-/g, ' ')
  const dexStr = pokemon.is_glitch ? '#000' : `#${String(pokemon.dex_number).padStart(3, '0')}`

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

      <div className="grid grid-cols-2 gap-4 text-sm">
        <Field label="Erika Skipped" value={run.erika_skipped} />
        <Field label="Erika Joked" value={run.erika_joked} />
        <Field label="Badge Boost Glitch" value={run.badge_boost_glitch} />
        <Field label="Brock Time" value={run.brock_finish_seconds ? formatTime(run.brock_finish_seconds) : null} note={run.brock_time_estimated ? '(estimated)' : undefined} />
        <Field label="Final Level" value={run.final_level} />
        <Field label="Completion Time" value={run.completion_seconds ? formatTime(run.completion_seconds) : null} />
        <Field label="jrose Tier" value={run.jrose_tier ? `${run.jrose_tier} #${run.jrose_tier_position}` : null} />
      </div>
    </main>
  )
}

function Field({ label, value, note }: { label: string; value: any; note?: string }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={value != null ? 'text-white' : 'text-gray-600 italic'}>
        {value != null ? (
          typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
        ) : (
          'Not set'
        )}
        {note && <span className="text-gray-500 ml-1 text-xs">{note}</span>}
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
