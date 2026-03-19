import { createSupabaseServer } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { AdminManager } from './admin-manager'

export default async function AdminPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (profile?.role !== 'admin') redirect('/manage/fields')

  const [{ data: users }, { data: completeRuns }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, role, created_at')
      .order('created_at'),
    supabase
      .from('runs')
      .select('id, status, pokemon(name, dex_number, is_glitch)')
      .eq('status', 'complete')
      .order('pokemon_id'),
  ])

  return <AdminManager users={users ?? []} completeRuns={completeRuns ?? []} />
}
