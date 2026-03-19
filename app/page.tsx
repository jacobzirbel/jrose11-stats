import { createSupabaseServer } from '@/lib/supabase-server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  stub: 'bg-gray-800 border-gray-700',
  in_progress: 'bg-yellow-900/40 border-yellow-700',
  needs_review: 'bg-blue-900/40 border-blue-700',
  complete: 'bg-green-900/40 border-green-700',
}

const STATUS_LABELS: Record<string, string> = {
  stub: 'Stub',
  in_progress: 'In Progress',
  needs_review: 'Needs Review',
  complete: 'Complete',
}

interface RunRow {
  pokemon_id: number
  youtube_url: string | null
  playlist_position: number | null
  status: string
  pokemon: {
    dex_number: number
    name: string
    sprite_url: string | null
    type1: string
    type2: string | null
    is_glitch: boolean
  }
}

type SortMode = 'dex' | 'video'

interface Props {
  searchParams: Promise<{ sort?: string }>
}

export default async function Home({ searchParams }: Props) {
  const { sort } = await searchParams
  const sortMode: SortMode = sort === 'video' ? 'video' : 'dex'

  const supabase = await createSupabaseServer()

  const { data: runs, error } = await supabase
    .from('runs')
    .select('pokemon_id, youtube_url, playlist_position, status, pokemon(dex_number, name, sprite_url, type1, type2, is_glitch)')
    .order('pokemon_id')

  if (error) {
    return (
      <main className="p-8 font-mono">
        <h1 className="text-2xl font-bold mb-4">jrose11 Gen 1 Stat Tracker</h1>
        <p className="text-red-400">Error: {error.message} ({error.code})</p>
      </main>
    )
  }

  const allRuns = (runs ?? []) as unknown as RunRow[]

  // Sort: dex order (default) or video/playlist order
  const typedRuns = sortMode === 'video'
    ? [...allRuns].sort((a, b) => {
        // Runs without a video go to the end
        if (a.playlist_position == null && b.playlist_position == null) return a.pokemon_id - b.pokemon_id
        if (a.playlist_position == null) return 1
        if (b.playlist_position == null) return -1
        return a.playlist_position - b.playlist_position
      })
    : allRuns
  const total = typedRuns.length
  const complete = typedRuns.filter((r) => r.status === 'complete').length
  const withVideo = typedRuns.filter((r) => r.youtube_url).length

  const statusCounts = typedRuns.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">jrose11 Gen 1 Stat Tracker</h1>
        <p className="text-gray-400">
          Tracking every solo run in the Gen 1 series
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="bg-gray-800 rounded-lg px-4 py-3">
          <div className="text-2xl font-bold">{complete}/{total}</div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">Complete</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-4 py-3">
          <div className="text-2xl font-bold">{withVideo}</div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">Videos</div>
        </div>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} className={`rounded-lg px-4 py-3 border ${STATUS_COLORS[key]}`}>
            <div className="text-2xl font-bold">{statusCounts[key] ?? 0}</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-6 text-sm">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded border ${STATUS_COLORS[key]}`} />
            <span className="text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {/* Sort toggle */}
      <div className="flex gap-2 mb-4">
        <Link
          href="/?sort=dex"
          className={`px-3 py-1.5 rounded text-sm ${sortMode === 'dex' ? 'bg-white text-gray-900 font-semibold' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Dex Order
        </Link>
        <Link
          href="/?sort=video"
          className={`px-3 py-1.5 rounded text-sm ${sortMode === 'video' ? 'bg-white text-gray-900 font-semibold' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Video Order
        </Link>
      </div>

      {/* Pokémon grid */}
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-16 gap-2">
        {typedRuns.map((run) => {
          const p = run.pokemon
          const displayName = p.name.charAt(0).toUpperCase() + p.name.slice(1).replace(/-/g, ' ')
          const dexStr = p.is_glitch ? '#000' : `#${String(p.dex_number).padStart(3, '0')}`

          return (
            <Link
              key={p.dex_number}
              href={`/run/${p.dex_number}`}
              className={`
                group relative rounded-lg border p-1.5 text-center
                transition-all hover:scale-105 hover:ring-2 hover:ring-white/20
                ${STATUS_COLORS[run.status]}
              `}
              title={`${dexStr} ${displayName} — ${STATUS_LABELS[run.status]}`}
            >
              {p.sprite_url ? (
                <img
                  src={p.sprite_url}
                  alt={p.name}
                  width={48}
                  height={48}
                  className="mx-auto pixelated"
                />
              ) : (
                <div className="w-12 h-12 mx-auto flex items-center justify-center text-gray-600 text-xs">
                  ?
                </div>
              )}
              <div className="text-[10px] text-gray-400 truncate">
                {sortMode === 'video' && run.playlist_position != null
                  ? `#${run.playlist_position + 1}`
                  : dexStr}
              </div>
              {run.youtube_url && (
                <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" title="Has video" />
              )}
            </Link>
          )
        })}
      </div>
    </main>
  )
}
