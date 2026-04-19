'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ShieldOff } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import type { FeatureKey } from '@/lib/features'
import { hasFeature } from '@/lib/features'

interface Props {
  feature: FeatureKey
  children: React.ReactNode
}

export function PermissionGate({ feature, children }: Props) {
  const t = useTranslations('permission')
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { setAllowed(false); return }
      const { data: profile } = await supabase
        .from('users')
        .select('role, granted_features')
        .eq('email', user.email)
        .single()
      if (!profile) { setAllowed(false); return }
      setAllowed(hasFeature(profile.role, profile.granted_features ?? [], feature))
    }
    check()
  }, [feature])

  if (allowed === null) return null

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
        <ShieldOff size={40} className="text-gray-300 dark:text-gray-600" />
        <div>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{t('noPermission')}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t('contactAdmin')}</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
