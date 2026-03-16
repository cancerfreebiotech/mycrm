'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import { Users, LayoutDashboard, ShieldCheck, Mail, LogOut, Settings, Tag, StickyNote, Search, BookOpen, Sun, Moon, Globe, BarChart2, ClipboardList } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config'

const LOCALE_LABELS: Record<Locale, string> = {
  'zh-TW': '繁中',
  'en': 'EN',
  'ja': '日本語',
}

interface UserProfile {
  display_name: string | null
  role: string
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('nav')
  const tf = useTranslations('footer')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [localeMenuOpen, setLocaleMenuOpen] = useState(false)
  const [currentLocale, setCurrentLocale] = useState<Locale>('zh-TW')
  const localeRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const cookie = document.cookie.split('; ').find(r => r.startsWith('MYCRM_LOCALE='))
    const val = cookie?.split('=')[1] as Locale | undefined
    if (val && (SUPPORTED_LOCALES as readonly string[]).includes(val)) setCurrentLocale(val)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (localeRef.current && !localeRef.current.contains(e.target as Node)) {
        setLocaleMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  async function handleLocaleChange(locale: Locale) {
    setLocaleMenuOpen(false)
    await fetch('/api/set-locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    })
    setCurrentLocale(locale)
    router.refresh()
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isSuperAdmin = profile?.role === 'super_admin'

  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? '/docs'
  const navItems: { href: string; label: string; icon: React.ElementType; external?: boolean }[] = [
    { href: '/', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/contacts', label: t('contacts'), icon: Users },
    { href: '/notes', label: t('notes'), icon: Search },
    { href: '/tasks', label: t('tasks'), icon: ClipboardList },
    { href: '/settings', label: t('settings'), icon: Settings },
    { href: docsUrl, label: t('docs'), icon: BookOpen, external: docsUrl.startsWith('http') },
    ...(isSuperAdmin ? [
      { href: '/admin/tags', label: t('tags'), icon: Tag },
      { href: '/unassigned-notes', label: t('unassignedNotes'), icon: StickyNote },
      { href: '/admin/templates', label: t('emailTemplates'), icon: Mail },
      { href: '/admin/models', label: t('models'), icon: ShieldCheck },
      { href: '/admin/users', label: t('users'), icon: ShieldCheck },
      { href: '/admin/reports', label: t('reports'), icon: BarChart2 },
    ] : []),
  ]

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="w-56 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-gray-200 dark:border-gray-700">
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">myCRM</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon, external }) => {
            const active = !external && (href === '/' ? pathname === '/' : pathname.startsWith(href))
            const cls = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
            }`
            return external ? (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                <Icon size={18} />
                {label}
              </a>
            ) : (
              <Link key={href} href={href} className={cls}>
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>
        {/* Version footer */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {tf('version')} {process.env.NEXT_PUBLIC_APP_VERSION}
          </p>
          {process.env.NEXT_PUBLIC_DEPLOY_TIME && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {tf('deployTime')} {process.env.NEXT_PUBLIC_DEPLOY_TIME}
            </p>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">{t('appTitle')}</span>
          <div className="flex items-center gap-4">
            {profile?.display_name && (
              <span className="text-sm text-gray-600 dark:text-gray-400">{profile.display_name}</span>
            )}
            {/* Language switcher */}
            <div className="relative" ref={localeRef}>
              <button
                onClick={() => setLocaleMenuOpen(o => !o)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
                title="Language"
              >
                <Globe size={16} />
                <span>{LOCALE_LABELS[currentLocale]}</span>
              </button>
              {localeMenuOpen && (
                <div className="absolute right-0 top-7 z-50 w-28 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                  {SUPPORTED_LOCALES.map((loc) => (
                    <button
                      key={loc}
                      onClick={() => handleLocaleChange(loc)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        loc === currentLocale
                          ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {LOCALE_LABELS[loc]}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              {t('logout')}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
