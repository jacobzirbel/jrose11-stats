/**
 * Seed script: Pokémon reference data from PokéAPI
 *
 * Populates: pokemon, moves, pokemon_moves
 * Creates:   run stubs (one per Pokémon, status='stub')
 *
 * Run: npx tsx scripts/seed-pokemon.ts
 * Requires: SUPABASE_DB_URL in .env
 *   Format: postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres
 *
 * PokéAPI responses are cached in scripts/.pokeapi-cache.json after the first
 * run. Delete that file to force a fresh fetch.
 */

import 'dotenv/config'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'

const POKEAPI_BASE = 'https://pokeapi.co/api/v2'
const GEN1_VERSION_GROUPS = new Set(['red-blue', 'yellow'])
const CACHE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.pokeapi-cache.json')

// ---------------------
// PokéAPI cache
// ---------------------

interface ApiCache {
  pokemonDetails: any[]
  moveDetails: any[]
}

async function loadCache(): Promise<ApiCache | null> {
  try {
    const data = await readFile(CACHE_FILE, 'utf-8')
    console.log('Using cached PokéAPI data (.pokeapi-cache.json)')
    return JSON.parse(data)
  } catch {
    return null
  }
}

async function saveCache(cache: ApiCache): Promise<void> {
  await writeFile(CACHE_FILE, JSON.stringify(cache))
  console.log(`PokéAPI data cached → ${CACHE_FILE}`)
}

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
  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) throw new Error('SUPABASE_DB_URL must be set in .env')

  const sql = postgres(dbUrl, { ssl: 'require' })

  // ---------------------
  // 1. Fetch all 151 Pokémon + move details (or load from cache)
  // ---------------------

  let pokemonDetails: any[]
  let moveDetails: any[]

  const cached = await loadCache()
  if (cached) {
    pokemonDetails = cached.pokemonDetails
    moveDetails = cached.moveDetails
  } else {
    console.log('Fetching Gen 1 Pokémon list...')
    const list = await fetchWithRetry(`${POKEAPI_BASE}/pokemon?limit=151&offset=0`)
    const pokemonUrls: string[] = list.results.map((p: any) => p.url)

    console.log(`Fetching details for ${pokemonUrls.length} Pokémon...`)
    pokemonDetails = await batchFetch(pokemonUrls, 5, 300)

    // Extract all unique Gen 1 move names across all learnsets
    const allMoveNames = new Set<string>()
    for (const p of pokemonDetails) {
      p.moves
        .filter((m: any) =>
          m.version_group_details.some((vg: any) => GEN1_VERSION_GROUPS.has(vg.version_group.name))
        )
        .forEach((m: any) => allMoveNames.add(m.move.name))
    }

    const moveUrls = Array.from(allMoveNames).map((name) => `${POKEAPI_BASE}/move/${name}`)
    console.log(`Fetching ${moveUrls.length} move details...`)
    moveDetails = await batchFetch(moveUrls, 15, 200)

    await saveCache({ pokemonDetails, moveDetails })
  }

  // ---------------------
  // 2. Build rows
  // ---------------------

  const pokemonRows = pokemonDetails.map((p) => ({
    dex_number: p.id as number,
    name: p.name as string,
    sprite_url: (p.sprites.front_default as string) ?? null,
    type1: p.types[0].type.name as string,
    type2: (p.types[1]?.type.name as string) ?? null,
    is_glitch: false,
  }))

  const learnsetMap = new Map<number, Set<string>>()
  for (const p of pokemonDetails) {
    const gen1Moves: string[] = p.moves
      .filter((m: any) =>
        m.version_group_details.some((vg: any) => GEN1_VERSION_GROUPS.has(vg.version_group.name))
      )
      .map((m: any) => m.move.name as string)
    learnsetMap.set(p.id, new Set(gen1Moves))
  }

  const moveRows = moveDetails.map((m) => ({
    name: m.name as string,
    category: (m.damage_class?.name as string) ?? null,
  }))

  console.log(`Found ${moveRows.length} unique Gen 1 moves across all learnsets`)

  // ---------------------
  // 3. Upsert into DB (direct postgres — bypasses PostgREST auth entirely)
  // ---------------------

  console.log(`\nInserting ${pokemonRows.length} Pokémon...`)
  await sql`
    INSERT INTO pokemon ${sql(pokemonRows)}
    ON CONFLICT (dex_number) DO UPDATE SET
      name       = EXCLUDED.name,
      sprite_url = EXCLUDED.sprite_url,
      type1      = EXCLUDED.type1,
      type2      = EXCLUDED.type2,
      is_glitch  = EXCLUDED.is_glitch
  `

  console.log(`Inserting ${moveRows.length} moves...`)
  const CHUNK = 200
  for (let i = 0; i < moveRows.length; i += CHUNK) {
    await sql`
      INSERT INTO moves ${sql(moveRows.slice(i, i + CHUNK))}
      ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category
    `
  }

  // Fetch back move IDs
  const insertedMoves: { id: number; name: string }[] = await sql`SELECT id, name FROM moves`
  const moveNameToId = new Map(insertedMoves.map((m: { id: number; name: string }) => [m.name, m.id]))

  const pokemonMoveRows: { pokemon_id: number; move_id: number }[] = []
  for (const [dexNumber, moveNames] of learnsetMap) {
    for (const moveName of moveNames) {
      const moveId = moveNameToId.get(moveName)
      if (moveId != null) pokemonMoveRows.push({ pokemon_id: dexNumber, move_id: moveId })
    }
  }

  console.log(`Inserting ${pokemonMoveRows.length} Pokémon-move associations...`)
  for (let i = 0; i < pokemonMoveRows.length; i += CHUNK) {
    await sql`
      INSERT INTO pokemon_moves ${sql(pokemonMoveRows.slice(i, i + CHUNK))}
      ON CONFLICT (pokemon_id, move_id) DO NOTHING
    `
  }

  // ---------------------
  // 4. Run stubs — trigger auto-populates run_moves
  // ---------------------

  console.log('Creating run stubs for all 151 Pokémon...')
  const runStubs = pokemonRows.map((p) => ({ pokemon_id: p.dex_number, status: 'stub' }))
  for (let i = 0; i < runStubs.length; i += CHUNK) {
    await sql`
      INSERT INTO runs ${sql(runStubs.slice(i, i + CHUNK))}
      ON CONFLICT (pokemon_id) DO NOTHING
    `
  }

  // ---------------------
  // 5. MissingNo.
  // ---------------------

  console.log('Inserting MissingNo. (#000)...')
  await sql`
    INSERT INTO pokemon (dex_number, name, sprite_url, type1, type2, is_glitch)
    VALUES (0, 'missingno', null, 'bird', 'normal', true)
    ON CONFLICT (dex_number) DO NOTHING
  `
  await sql`
    INSERT INTO runs (pokemon_id, status)
    VALUES (0, 'stub')
    ON CONFLICT (pokemon_id) DO NOTHING
  `

  await sql.end()

  console.log('\n✓ Pokémon seed complete')
  console.log(`  ${pokemonRows.length} Pokémon + MissingNo.`)
  console.log(`  ${moveRows.length} moves`)
  console.log(`  ${pokemonMoveRows.length} learnset entries`)
  console.log(`  152 run stubs`)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
