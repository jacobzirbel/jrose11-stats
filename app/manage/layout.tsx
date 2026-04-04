import { createSupabaseServer } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role
  if (!role || role === 'account') redirect('/')

  const isAdmin = role === 'admin'

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Manage</h1>
      <nav className="flex gap-1 mb-8 border-b border-gray-800">
        <TabLink href="/manage/fields">Custom Fields</TabLink>
        {isAdmin && <TabLink href="/manage/assign">Assign</TabLink>}
        {isAdmin && <TabLink href="/manage/admin">Admin</TabLink>}
      </nav>
      {children}
    </div>
  )
}

function TabLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-500 transition-colors -mb-px"
    >
      {children}
    </Link>
  )
}
