'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Building2, Loader2, ShieldOff, Check } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

type SettingKey =
  | 'org_name'
  | 'allowed_email_domains'
  | 'newsletter_logo_url'
  | 'newsletter_reply_to'
  | 'company_website'
  | 'company_facebook'
  | 'company_linkedin'
  | 'feedback_recipient'
  | 'sender_name'
  | 'internal_email_domain'
  | 'org_email_domain'
  | 'bcc_inbox_domain'
  | 'postal_address'
  | 'owner_email'
  | 'app_url'
  | 'hunter_enabled'
  | 'ai_assistant_enabled'

interface SettingEntry {
  value: string
  fallback: string
}

// Field render order + which i18n label / hint keys each uses.
const FIELDS: { key: SettingKey; labelKey: string; hintKey?: string; multiline?: boolean }[] = [
  { key: 'org_name', labelKey: 'labelOrgName' },
  { key: 'allowed_email_domains', labelKey: 'labelAllowedDomains', hintKey: 'hintAllowedDomains' },
  { key: 'newsletter_logo_url', labelKey: 'labelNewsletterLogoUrl' },
  { key: 'newsletter_reply_to', labelKey: 'labelNewsletterReplyTo' },
  { key: 'company_website', labelKey: 'labelCompanyWebsite' },
  { key: 'company_facebook', labelKey: 'labelCompanyFacebook' },
  { key: 'company_linkedin', labelKey: 'labelCompanyLinkedin' },
  { key: 'feedback_recipient', labelKey: 'labelFeedbackRecipient', hintKey: 'hintFeedbackRecipient' },
  { key: 'sender_name', labelKey: 'labelSenderName', hintKey: 'hintSenderName' },
  { key: 'internal_email_domain', labelKey: 'labelInternalEmailDomain', hintKey: 'hintInternalEmailDomain' },
  { key: 'org_email_domain', labelKey: 'labelOrgEmailDomain', hintKey: 'hintOrgEmailDomain' },
  { key: 'bcc_inbox_domain', labelKey: 'labelBccInboxDomain', hintKey: 'hintBccInboxDomain' },
  { key: 'postal_address', labelKey: 'labelPostalAddress', hintKey: 'hintPostalAddress', multiline: true },
  { key: 'owner_email', labelKey: 'labelOwnerEmail', hintKey: 'hintOwnerEmail' },
  { key: 'app_url', labelKey: 'labelAppUrl', hintKey: 'hintAppUrl' },
]

// Module kill-switches. Rendered as toggles; values stored as 'true' / 'false'.
const TOGGLES: { key: SettingKey; labelKey: string; hintKey: string }[] = [
  { key: 'hunter_enabled', labelKey: 'labelHunterEnabled', hintKey: 'hintHunterEnabled' },
  { key: 'ai_assistant_enabled', labelKey: 'labelAiAssistantEnabled', hintKey: 'hintAiAssistantEnabled' },
]

export default function AdminOrgSettingsPage() {
  const t = useTranslations('orgSettings')
  const tc = useTranslations('common')
  const tp = useTranslations('permission')

  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [fallbacks, setFallbacks] = useState<Record<string, string>>({})
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { setAllowed(false); setLoading(false); return }
      const { data: profile } = await supabase.from('users').select('role').eq('email', user.email).single()
      if (profile?.role !== 'super_admin') { setAllowed(false); setLoading(false); return }
      setAllowed(true)
      await load()
    }
    init()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/org-settings')
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json() as { settings: Record<string, SettingEntry> }
      const values: Record<string, string> = {}
      const fb: Record<string, string> = {}
      for (const [key, entry] of Object.entries(json.settings)) {
        values[key] = entry.value
        fb[key] = entry.fallback
      }
      setForm(values)
      setFallbacks(fb)
    } catch {
      setError(t('loadError'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/org-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: form }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setSaved(true)
    } catch {
      setError(t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 text-base border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  if (allowed === null || (allowed && loading)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
        <ShieldOff size={40} className="text-gray-300 dark:text-gray-600" />
        <div>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">{tp('noPermission')}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{tp('contactAdmin')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <Building2 size={22} className="text-blue-600 dark:text-blue-400 shrink-0" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('description')}</p>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 space-y-5">
        {FIELDS.map(({ key, labelKey, hintKey, multiline }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t(labelKey)}
            </label>
            {multiline ? (
              <textarea
                rows={2}
                value={form[key] ?? ''}
                onChange={(e) => { setForm((p) => ({ ...p, [key]: e.target.value })); setSaved(false) }}
                placeholder={fallbacks[key] ?? ''}
                className={`${inputClass} resize-y`}
              />
            ) : (
              <input
                type="text"
                value={form[key] ?? ''}
                onChange={(e) => { setForm((p) => ({ ...p, [key]: e.target.value })); setSaved(false) }}
                placeholder={fallbacks[key] ?? ''}
                className={inputClass}
              />
            )}
            {hintKey && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t(hintKey)}</p>
            )}
          </div>
        ))}

        <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('sectionModules')}</h2>
          <div className="space-y-4">
            {TOGGLES.map(({ key, labelKey, hintKey }) => {
              const isOn = (form[key] || fallbacks[key] || 'true') === 'true'
              return (
                <div key={key} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t(labelKey)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t(hintKey)}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-label={t(labelKey)}
                    onClick={() => { setForm((p) => ({ ...p, [key]: isOn ? 'false' : 'true' })); setSaved(false) }}
                    className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0"
                  >
                    <span className={`inline-flex h-6 w-11 items-center rounded-full transition-colors ${isOn ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {saved && (
          <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <Check size={15} className="shrink-0" /> {t('saved')}
          </p>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? t('saving') : tc('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
