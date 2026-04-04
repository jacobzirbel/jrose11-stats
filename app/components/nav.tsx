import { createSupabaseServer } from '@/lib/supabase-server'
import Link from 'next/link'
import { SignOutButton } from './sign-out-button'

export async function Nav() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  let profile: { username: string; role: string } | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('username, role')
      .eq('id', user.id)
      .single()
    profile = data
  }

  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="font-bold text-sm hover:text-white text-gray-300">
          jrose11 Stat Tracker
        </Link>

        <div className="flex items-center gap-3 text-sm">
          {profile ? (
            <>
              {['contributor', 'admin'].includes(profile.role) && (
                <Link href="/manage" className="text-gray-400 hover:text-white">
                  Manage
                </Link>
              )}
              <span className="text-gray-400">
                {profile.username}
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                  {profile.role.replaceAll('_', ' ')}
                </span>
              </span>
              <SignOutButton />
            </>
          ) : (
            <Link href="/auth/login" className="text-gray-400 hover:text-white">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
