'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import { Users, LayoutDashboard, ShieldCheck, Mail, LogOut, Settings, Tag, StickyNote, Search, BookOpen, Sun, Moon, Globe, BarChart2, ClipboardList, MapPin, Menu, X, ChevronLeft, ChevronRight, Newspaper, ScanSearch, FolderInput, Activity, Images } from 'lucide-react'
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    setCollapsed(localStorage.getItem('sidebar-collapsed') === 'true')
  }, [])

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

  // Close mobile sidebar on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

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

  type NavItem = { href: string; label: string; icon: React.ElementType; external?: boolean }
  const memberItems: NavItem[] = [
    { href: '/', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/contacts', label: t('contacts'), icon: Users },
    { href: '/photos', label: t('photos'), icon: Images },
    { href: '/notes', label: t('notes'), icon: Search },
    { href: '/tasks', label: t('tasks'), icon: ClipboardList },
    { href: '/admin/reports', label: t('reports'), icon: BarChart2 },
    { href: '/settings', label: t('settings'), icon: Settings },
    { href: docsUrl, label: t('docs'), icon: BookOpen, external: docsUrl.startsWith('http') },
  ]
  const adminItems: NavItem[] = isSuperAdmin ? [
    { href: '/admin/tags', label: t('tags'), icon: Tag },
    { href: '/unassigned-notes', label: t('unassignedNotes'), icon: StickyNote },
    { href: '/admin/templates', label: t('emailTemplates'), icon: Mail },
    { href: '/admin/models', label: t('models'), icon: ShieldCheck },
    { href: '/admin/users', label: t('users'), icon: ShieldCheck },
    { href: '/admin/prompts', label: t('prompts'), icon: ShieldCheck },
    { href: '/admin/countries', label: t('countries'), icon: MapPin },
    { href: '/admin/newsletter', label: t('newsletter'), icon: Newspaper },
    { href: '/admin/failed-scans', label: t('failedScans'), icon: ShieldCheck },
    { href: '/admin/duplicates', label: t('duplicates'), icon: ScanSearch },
    { href: '/admin/camcard', label: t('camcard'), icon: FolderInput },
    { href: '/admin/health', label: t('health'), icon: Activity },
  ] : []

  // Label span shared classes — hidden on tablet, shown on hover & desktop (unless collapsed)
  const labelCls = collapsed
    ? 'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 max-w-[160px] sm:max-w-0 sm:opacity-0 group-hover/sb:max-w-[160px] group-hover/sb:opacity-100 lg:max-w-0 lg:opacity-0 lg:group-hover/sb:max-w-0 lg:group-hover/sb:opacity-0'
    : 'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 max-w-[160px] sm:max-w-0 sm:opacity-0 group-hover/sb:max-w-[160px] group-hover/sb:opacity-100 lg:max-w-[160px] lg:opacity-100'

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`group/sb fixed inset-y-0 left-0 z-50 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-[width,transform] duration-200 overflow-hidden
          w-56 sm:w-16 sm:hover:w-56 ${collapsed ? 'lg:w-16 lg:hover:w-16' : 'lg:w-56'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} sm:translate-x-0`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className={`text-lg font-bold text-gray-900 dark:text-gray-100 ${labelCls}`}>
            myCRM
          </span>
          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="sm:hidden text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shrink-0 ml-auto"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {[...memberItems, ...adminItems].map(({ href, label, icon: Icon, external }, idx) => {
            const active = !external && (href === '/' ? pathname === '/' : pathname.startsWith(href))
            const isFirstAdminItem = isSuperAdmin && idx === memberItems.length
            const cls = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
            }`
            return (
              <React.Fragment key={href}>
                {isFirstAdminItem && (
                  <div className="my-2 border-t border-gray-200 dark:border-gray-700" />
                )}
                {external ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                    <Icon size={18} className="shrink-0" />
                    <span className={labelCls}>{label}</span>
                  </a>
                ) : (
                  <Link href={href} className={cls}>
                    <Icon size={18} className="shrink-0" />
                    <span className={labelCls}>{label}</span>
                  </Link>
                )}
              </React.Fragment>
            )
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={toggleCollapsed}
          className="hidden lg:flex items-center justify-center h-8 mx-2 mb-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
          title={collapsed ? '展開側邊欄' : '收合側邊欄'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Version footer */}
        <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <div className={labelCls}>
            <p className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
              {tf('version')} {process.env.NEXT_PUBLIC_APP_VERSION}
            </p>
            {process.env.NEXT_PUBLIC_DEPLOY_TIME && (
              <p className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                {tf('deployTime')} {process.env.NEXT_PUBLIC_DEPLOY_TIME}
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* Main (offset by sidebar width) */}
      <div className={`h-full flex flex-col ml-0 sm:ml-16 transition-[margin] duration-200 ${collapsed ? 'lg:ml-16' : 'lg:ml-56'}`}>
        {/* Header */}
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 sm:px-6 shrink-0">
          {/* Hamburger (mobile only) */}
          <button
            onClick={() => setMobileOpen(true)}
            className="sm:hidden text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 mr-3"
          >
            <Menu size={20} />
          </button>

          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">{t('appTitle')}</span>

          <div className="flex items-center gap-4">
            {profile?.display_name && (
              <span className="hidden sm:block text-sm text-gray-600 dark:text-gray-400">{profile.display_name}</span>
            )}
            {/* Language switcher */}
            <div className="relative" ref={localeRef}>
              <button
                onClick={() => setLocaleMenuOpen(o => !o)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
                title="Language"
              >
                <Globe size={16} />
                <span className="hidden sm:inline">{LOCALE_LABELS[currentLocale]}</span>
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
              <span className="hidden sm:inline">{t('logout')}</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
