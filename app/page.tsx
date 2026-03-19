import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { count, error } = await supabase
    .from('pokemon')
    .select('*', { count: 'exact', head: true })

  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem' }}>
      <h1>jrose11 Gen 1 Stat Tracker</h1>
      {error ? (
        <p>⚠ Error: {error.message} (code: {error.code})</p>
      ) : (
        <p>✓ Connected to Supabase — {count ?? 0} Pokémon in database</p>
      )}
    </main>
  )
}
