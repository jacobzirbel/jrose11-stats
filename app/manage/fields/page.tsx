import { createSupabaseServer } from '@/lib/supabase-server'
import { FieldsManager } from './fields-manager'

export default async function FieldsPage() {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  const { data: fields } = await supabase
    .from('custom_field_definitions')
    .select('id, name, field_type, description, enum_options, status')
    .order('status')
    .order('id')

  return <FieldsManager fields={fields ?? []} isAdmin={isAdmin} />
}
