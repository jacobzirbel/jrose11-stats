/**
 * Seed script: YouTube playlist sync
 *
 * Fetches all videos from jrose11's Gen 1 playlist and upserts YouTube URLs
 * into existing run stubs, matched by Pokémon name found in the video title.
 *
 * Run: npx tsx scripts/seed-youtube.ts
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, YOUTUBE_API_KEY,
 *           YOUTUBE_PLAYLIST_ID in .env
 *
 * This same logic runs as a daily Vercel cron in production.
 */

import 'dotenv/config'
import postgres from 'postgres'

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

interface PlaylistItem {
  title: string
  videoId: string
  publishedAt: string
  position: number
}

interface PokemonRow {
  dex_number: number
  name: string // PokéAPI slug, e.g. 'mr-mime', 'nidoran-f', 'farfetchd'
}

interface LookupEntry {
  alias: string        // lowercase string to search for in title
  dexNumbers: number[] // usually one, but [29, 32] for bare "nidoran"
  apiName: string      // original slug (for display)
}

// ---------------------
// Name matching
// ---------------------

/**
 * Build all lowercase aliases that might appear in a jrose11 video title
 * for a given PokéAPI slug name.
 *
 * Aliases are tried longest-first so "charmander" is never shadowed by "char".
 * Nidoran is intentionally NOT given a bare "nidoran" alias — titles that
 * don't disambiguate gender will be flagged as ambiguous.
 */
function buildAliases(apiName: string): string[] {
  const name = apiName.toLowerCase()
  const aliases = new Set<string>()

  // Generic transforms of the API slug
  aliases.add(name)                          // nidoran-f, mr-mime, farfetchd
  aliases.add(name.replace(/-/g, ' '))       // nidoran f, mr mime
  aliases.add(name.replace(/-/g, ''))        // nidoranf, mrmime

  // Special cases — override or supplement the generic transforms
  const overrides: Record<string, string[]> = {
    'farfetchd': ["farfetch'd", 'farfetched'],  // common misspelling in titles too

    // Nidoran: no bare "nidoran" alias on either entry — forces explicit disambiguation
    'nidoran-f': ['nidoran female', 'nidoran-female', 'nidoran♀', 'nidoran (f)', 'nidoran f'],
    'nidoran-m': ['nidoran male', 'nidoran-male', 'nidoran♂', 'nidoran (m)', 'nidoran m'],

    'mr-mime': ['mr. mime', 'mr.mime', 'mr mime', 'mr-mime'],
  }

  const extra = overrides[name]
  if (extra) {
    // For nidoran variants, remove the generic slug aliases (too ambiguous)
    if (name.startsWith('nidoran-')) {
      aliases.clear()
    }
    extra.forEach((a) => aliases.add(a))
  }

  return Array.from(aliases).filter((a) => a.length > 0)
}

/**
 * Build the flat lookup list sorted by alias length descending.
 * Longer aliases are tried first to avoid substring matches
 * (e.g. "charmander" before "char", though no Gen 1 Pokémon names are
 * actually substrings of another — this is a safety measure).
 */
/**
 * Build the flat lookup list sorted by alias length descending.
 * Longer aliases are tried first so they consume text before shorter ones can
 * match. e.g. "nidoran female" is tried before "nidoran", preventing the
 * catch-all from also claiming the male variant.
 *
 * The bare "nidoran" entry maps to BOTH dex numbers [29, 32] — used when
 * jrose11 covers both Nidoran variants in a single video.
 */
function buildLookup(pokemon: PokemonRow[]): LookupEntry[] {
  const entries: LookupEntry[] = []

  for (const p of pokemon) {
    for (const alias of buildAliases(p.name)) {
      entries.push({ alias, dexNumbers: [p.dex_number], apiName: p.name })
    }
  }

  // Bare "nidoran" catch-all: maps to both variants. Must be shorter than the
  // gender-specific aliases so it is tried last and only fires when neither
  // "nidoran female" nor "nidoran male" matched first.
  entries.push({ alias: 'nidoran', dexNumbers: [29, 32], apiName: 'nidoran (both)' })

  entries.sort((a, b) => b.alias.length - a.alias.length)
  return entries
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface MatchResult {
  dexNumbers: number[]
  apiName: string
  matchedAlias: string
}

/**
 * Find ALL Pokémon mentioned in a video title.
 *
 * Aliases are tried longest-first. When one matches, the matched text is
 * replaced with spaces in a working copy of the title so shorter aliases
 * (e.g. bare "nidoran") cannot claim text that was already consumed.
 *
 * Returns an array — usually one entry, but two for the shared Nidoran video.
 */
function findAllPokemonInTitle(title: string, lookup: LookupEntry[]): MatchResult[] {
  let working = title.toLowerCase()
  const claimedDex = new Set<number>()
  const results: MatchResult[] = []

  for (const entry of lookup) {
    // Skip if every dex number in this entry is already claimed
    if (entry.dexNumbers.every((d) => claimedDex.has(d))) continue

    let didMatch = false
    try {
      const pattern = new RegExp(`(?<![a-z])${escapeRegex(entry.alias)}(?![a-z])`, 'ig')
      if (pattern.test(working)) {
        // Consume matched text to prevent shorter aliases re-matching it
        working = working.replace(
          new RegExp(`(?<![a-z])${escapeRegex(entry.alias)}(?![a-z])`, 'ig'),
          ' '.repeat(entry.alias.length)
        )
        didMatch = true
      }
    } catch {
      if (working.includes(entry.alias)) {
        working = working.split(entry.alias).join(' '.repeat(entry.alias.length))
        didMatch = true
      }
    }

    if (didMatch) {
      const newDex = entry.dexNumbers.filter((d) => !claimedDex.has(d))
      newDex.forEach((d) => claimedDex.add(d))
      results.push({ dexNumbers: newDex, apiName: entry.apiName, matchedAlias: entry.alias })
    }
  }

  return results
}

// ---------------------
// YouTube helpers
// ---------------------

async function fetchAllPlaylistItems(
  playlistId: string,
  apiKey: string
): Promise<PlaylistItem[]> {
  const items: PlaylistItem[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      part: 'snippet',
      playlistId,
      maxResults: '50',
      key: apiKey,
      ...(pageToken ? { pageToken } : {}),
    })

    const res = await fetch(`${YOUTUBE_API_BASE}/playlistItems?${params}`)
    if (!res.ok) {
      const err = await res.json()
      throw new Error(`YouTube API error: ${JSON.stringify(err)}`)
    }

    const data = await res.json()

    for (const item of data.items) {
      const snippet = item.snippet
      if (!snippet.resourceId?.videoId || snippet.title === 'Deleted video') continue

      items.push({
        title: snippet.title as string,
        videoId: snippet.resourceId.videoId as string,
        publishedAt: snippet.publishedAt as string,
        position: snippet.position as number,
      })
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  return items
}

// ---------------------
// Main
// ---------------------

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL
  const apiKey = process.env.YOUTUBE_API_KEY
  const playlistId = process.env.YOUTUBE_PLAYLIST_ID

  if (!dbUrl) throw new Error('SUPABASE_DB_URL must be set in .env')
  if (!apiKey || !playlistId) {
    throw new Error('YOUTUBE_API_KEY and YOUTUBE_PLAYLIST_ID must be set in .env')
  }

  const sql = postgres(dbUrl, { ssl: 'require' })

  // Load Pokémon names from the DB
  console.log('Loading Pokémon names from database...')
  const pokemon = await sql<PokemonRow[]>`SELECT dex_number, name FROM pokemon ORDER BY dex_number`
  if (!pokemon.length) throw new Error('No Pokémon in database — run seed-pokemon.ts first')

  const lookup = buildLookup(pokemon)
  console.log(`Built name lookup with ${lookup.length} aliases for ${pokemon.length} Pokémon`)

  // Fetch playlist
  console.log(`\nFetching playlist: ${playlistId}`)
  const items = await fetchAllPlaylistItems(playlistId, apiKey)
  console.log(`Found ${items.length} videos\n`)

  let matched = 0
  let unmatched = 0
  const unmatchedTitles: string[] = []

  for (const item of items) {
    const results = findAllPokemonInTitle(item.title, lookup)

    if (results.length === 0) {
      unmatched++
      unmatchedTitles.push(item.title)
      continue
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${item.videoId}`

    for (const result of results) {
      for (const dexNumber of result.dexNumbers) {
        await sql`
          UPDATE runs SET youtube_url = ${youtubeUrl}, playlist_position = ${item.position}
          WHERE pokemon_id = ${dexNumber} AND status = 'stub'
        `
        matched++
        const dexStr = String(dexNumber).padStart(3, '0')
        console.log(`  #${dexStr} ${result.apiName.padEnd(14)} ← matched "${result.matchedAlias}"`)
      }
    }
  }

  await sql.end()

  console.log('\n✓ YouTube sync complete')
  console.log(`  ${matched} run stubs updated with YouTube links`)

  if (unmatched > 0) {
    console.log(`\n  ${unmatched} videos could not be matched to a Pokémon:`)
    unmatchedTitles.forEach((t) => console.log(`    - "${t}"`))
    console.log(
      '\n  Tip: if jrose11 uses an unusual spelling, add it to the overrides in buildAliases().'
    )
  }
}

main().catch((err) => {
  console.error('Sync failed:', err)
  process.exit(1)
})
