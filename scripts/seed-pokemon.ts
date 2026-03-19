/**
 * Seed script: Pokémon reference data from PokéAPI
 *
 * Populates: pokemon, moves, pokemon_moves
 * Creates:   run stubs (one per Pokémon, status='stub')
 *
 * Run: npx tsx scripts/seed-pokemon.ts
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const POKEAPI_BASE = 'https://pokeapi.co/api/v2'
const GEN1_VERSION_GROUPS = new Set(['red-blue', 'yellow'])

// ---------------------
// Fetch helpers
// ---------------------

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status} ${res.statusText}`)
  return res.json()
}

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetchJSON(url)
    } catch (err) {
      if (attempt === retries) throw err
      const delay = 500 * attempt
      console.warn(`  Retry ${attempt}/${retries} for ${url} (waiting ${delay}ms)`)
      await sleep(delay)
    }
  }
}

async function batchFetch<T>(urls: string[], batchSize = 10, delayMs = 200): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map((url) => fetchWithRetry(url)))
    results.push(...batchResults)
    if (i + batchSize < urls.length) await sleep(delayMs)
    process.stdout.write(`\r  ${Math.min(i + batchSize, urls.length)}/${urls.length}`)
  }
  process.stdout.write('\n')
  return results
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------
// Main
// ---------------------

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env')
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // ---------------------
  // 1. Fetch all 151 Pokémon details
  // ---------------------

  console.log('Fetching Gen 1 Pokémon list...')
  const list = await fetchWithRetry(`${POKEAPI_BASE}/pokemon?limit=151&offset=0`)
  const pokemonUrls: string[] = list.results.map((p: any) => p.url)

  console.log(`Fetching details for ${pokemonUrls.length} Pokémon...`)
  const pokemonDetails: any[] = await batchFetch(pokemonUrls, 5, 300)

  // ---------------------
  // 2. Build pokemon rows + learnset map
  // ---------------------

  const pokemonRows = pokemonDetails.map((p) => ({
    dex_number: p.id as number,
    name: p.name as string,
    sprite_url: (p.sprites.front_default as string) ?? null,
    type1: p.types[0].type.name as string,
    type2: (p.types[1]?.type.name as string) ?? null,
  }))

  // Map: dex_number -> Set of move names learnable in Gen 1
  const learnsetMap = new Map<number, Set<string>>()
  const allMoveNames = new Set<string>()

  for (const p of pokemonDetails) {
    const gen1Moves: string[] = p.moves
      .filter((m: any) =>
        m.version_group_details.some((vg: any) =>
          GEN1_VERSION_GROUPS.has(vg.version_group.name)
        )
      )
      .map((m: any) => m.move.name as string)

    learnsetMap.set(p.id, new Set(gen1Moves))
    gen1Moves.forEach((name) => allMoveNames.add(name))
  }

  console.log(`Found ${allMoveNames.size} unique Gen 1 moves across all learnsets`)

  // ---------------------
  // 3. Fetch move details (for damage_class / category)
  // ---------------------

  const moveUrls = Array.from(allMoveNames).map((name) => `${POKEAPI_BASE}/move/${name}`)
  console.log(`Fetching ${moveUrls.length} move details...`)
  const moveDetails: any[] = await batchFetch(moveUrls, 15, 200)

  const moveRows = moveDetails.map((m) => ({
    name: m.name as string,
    category: (m.damage_class?.name as string) ?? null, // 'physical' | 'special' | 'status'
  }))

  // ---------------------
  // 4. Upsert into Supabase
  // ---------------------

  console.log(`\nInserting ${pokemonRows.length} Pokémon...`)
  const { error: pokemonErr } = await supabase
    .from('pokemon')
    .upsert(pokemonRows, { onConflict: 'dex_number' })
  if (pokemonErr) throw new Error(`pokemon upsert: ${pokemonErr.message}`)

  console.log(`Inserting ${moveRows.length} moves...`)
  // Insert in chunks — Supabase has a URL length limit
  const CHUNK = 200
  for (let i = 0; i < moveRows.length; i += CHUNK) {
    const { error } = await supabase
      .from('moves')
      .upsert(moveRows.slice(i, i + CHUNK), { onConflict: 'name' })
    if (error) throw new Error(`moves upsert chunk ${i}: ${error.message}`)
  }

  // Fetch back inserted moves to get their generated IDs
  const { data: insertedMoves, error: fetchMovesErr } = await supabase
    .from('moves')
    .select('id, name')
  if (fetchMovesErr) throw new Error(`fetch moves: ${fetchMovesErr.message}`)

  const moveNameToId = new Map(insertedMoves!.map((m: any) => [m.name as string, m.id as number]))

  // Build pokemon_moves rows
  const pokemonMoveRows: { pokemon_id: number; move_id: number }[] = []
  for (const [dexNumber, moveNames] of learnsetMap) {
    for (const moveName of moveNames) {
      const moveId = moveNameToId.get(moveName)
      if (moveId != null) {
        pokemonMoveRows.push({ pokemon_id: dexNumber, move_id: moveId })
      }
    }
  }

  console.log(`Inserting ${pokemonMoveRows.length} Pokémon-move associations...`)
  for (let i = 0; i < pokemonMoveRows.length; i += CHUNK) {
    const { error } = await supabase
      .from('pokemon_moves')
      .upsert(pokemonMoveRows.slice(i, i + CHUNK), { onConflict: 'pokemon_id,move_id' })
    if (error) throw new Error(`pokemon_moves upsert chunk ${i}: ${error.message}`)
  }

  // ---------------------
  // 5. Create run stubs (one per Pokémon)
  //    The on_run_created trigger will auto-populate run_moves.
  // ---------------------

  console.log('Creating run stubs for all 151 Pokémon...')
  const runStubs = pokemonRows.map((p) => ({
    pokemon_id: p.dex_number,
    status: 'stub' as const,
  }))

  const { error: runsErr } = await supabase
    .from('runs')
    .upsert(runStubs, { onConflict: 'pokemon_id' })
  if (runsErr) throw new Error(`runs upsert: ${runsErr.message}`)

  // ---------------------
  // Done
  // ---------------------

  console.log('\n✓ Pokémon seed complete')
  console.log(`  ${pokemonRows.length} Pokémon`)
  console.log(`  ${moveRows.length} moves`)
  console.log(`  ${pokemonMoveRows.length} learnset entries`)
  console.log(`  151 run stubs (run_moves auto-populated by DB trigger)`)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
