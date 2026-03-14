'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Users, LayoutDashboard, ShieldCheck, Mail, LogOut, Settings, Tag, StickyNote, Search, BookOpen, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface UserProfile {
  display_name: string | null
  role: string
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

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

  const isSuperAdmin = profile?.role === 'super_admin'

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/contacts', label: '聯絡人', icon: Users },
    { href: '/notes', label: '筆記搜尋', icon: Search },
    { href: '/admin/tags', label: 'Tag 管理', icon: Tag },
    { href: '/unassigned-notes', label: '未歸類筆記', icon: StickyNote },
    ...(isSuperAdmin ? [
      { href: '/admin/models', label: '模型管理', icon: ShieldCheck },
      { href: '/admin/users', label: '使用者管理', icon: ShieldCheck },
    ] : []),
    { href: '/admin/templates', label: '郵件範本', icon: Mail },
    { href: '/settings', label: '個人設定', icon: Settings },
    { href: '/docs', label: '使用說明', icon: BookOpen },
  ]

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-gray-200 dark:border-gray-700">
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">myCRM</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>
        {/* Version footer */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            v{process.env.NEXT_PUBLIC_APP_VERSION}
          </p>
          {process.env.NEXT_PUBLIC_DEPLOY_TIME && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              部署於 {process.env.NEXT_PUBLIC_DEPLOY_TIME}
            </p>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">myCRM 管理系統</span>
          <div className="flex items-center gap-4">
            {profile?.display_name && (
              <span className="text-sm text-gray-600 dark:text-gray-400">{profile.display_name}</span>
            )}
            {mounted && (
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                title={theme === 'dark' ? '切換淺色' : '切換深色'}
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
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
