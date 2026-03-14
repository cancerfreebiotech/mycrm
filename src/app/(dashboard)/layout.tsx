'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Users, LayoutDashboard, ShieldCheck, Mail, LogOut, Settings } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface UserProfile {
  display_name: string | null
  role: string
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    async function loadProfile() {
      const supabase = createBrowserSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('users')
        .select('display_name, role')
        .eq('email', user.email)
        .single()

      if (data) setProfile(data)
    }
    loadProfile()
  }, [])

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isAdmin = profile?.role === 'admin'

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/contacts', label: '聯絡人', icon: Users },
    { href: '/admin/templates', label: '郵件範本', icon: Mail },
    { href: '/settings', label: '個人設定', icon: Settings },
    ...(isAdmin ? [{ href: '/admin/users', label: '使用者管理', icon: ShieldCheck }] : []),
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-gray-200">
          <span className="text-lg font-bold text-gray-900">myCRM</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <span className="text-sm font-semibold text-gray-700 tracking-wide">myCRM 管理系統</span>
          <div className="flex items-center gap-4">
            {profile?.display_name && (
              <span className="text-sm text-gray-600">{profile.display_name}</span>
            )}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
