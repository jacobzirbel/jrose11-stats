import { createSupabaseServer } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { AssignManager } from './assign-manager'

export default async function AssignPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (profile?.role !== 'admin') redirect('/manage/fields')

  const [{ data: runs }, { data: contributors }] = await Promise.all([
    supabase
      .from('runs')
      .select('id, status, contributor_id, pokemon(name, dex_number, is_glitch)')
      .neq('status', 'complete')
      .order('pokemon_id'),
    supabase
      .from('profiles')
      .select('id, username')
      .in('role', ['contributor', 'admin'])
      .order('username'),
  ])

  const mappedRuns = (runs ?? []).map((r: any) => ({
    id: r.id as number,
    status: r.status as string,
    contributor_id: r.contributor_id as string | null,
    pokemon: r.pokemon as { name: string; dex_number: number; is_glitch: boolean },
  }))

  return <AssignManager runs={mappedRuns} contributors={contributors ?? []} />
}
