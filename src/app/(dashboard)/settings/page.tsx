'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Sun, Moon, Check, RotateCcw, X, Plus, ChevronDown, ShieldCheck, ShieldOff, Loader2, Eye, EyeOff } from 'lucide-react'
import QRCode from 'qrcode'
import { SUPPORTED_LOCALES, type Locale } from '@/i18n/config'
import { SYSTEM_PROMPTS } from '@/lib/prompt-constants'

const LOCALE_LABELS: Record<Locale, string> = {
  'zh-TW': '繁體中文',
  'en': 'English',
  'ja': '日本語',
}

interface AiEndpoint {
  id: string
  name: string
  is_active: boolean
}

interface AiModel {
  id: string
  endpoint_id: string
  model_id: string
  display_name: string
}

export default function SettingsPage() {
  const supabase = createBrowserSupabaseClient()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const [mounted, setMounted] = useState(false)

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('')
  const [telegramId, setTelegramId] = useState('')
  const [teamsUserId, setTeamsUserId] = useState<string | null>(null)
  const [locale, setLocale] = useState<Locale>('zh-TW')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [endpoints, setEndpoints] = useState<AiEndpoint[]>([])
  const [allModels, setAllModels] = useState<AiModel[]>([])
  const [selectedEndpointId, setSelectedEndpointId] = useState<string>('')
  const [selectedModelId, setSelectedModelId] = useState<string>('')  // ai_models.id (UUID)

  const [assistants, setAssistants] = useState<Array<{ id: string; assistant_email: string; users: { display_name: string | null } | null }>>([])
  const [allUsers, setAllUsers] = useState<Array<{ email: string; display_name: string | null }>>([])
  const [assistantError, setAssistantError] = useState<string | null>(null)
  const [showAssistantPicker, setShowAssistantPicker] = useState(false)

  const [emailPrompt, setEmailPrompt] = useState('')
  const [savedEmailPrompt, setSavedEmailPrompt] = useState('')
  const [savingEmailPrompt, setSavingEmailPrompt] = useState(false)
  const [savedEmailPromptFlag, setSavedEmailPromptFlag] = useState(false)

  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaLoading, setMfaLoading] = useState(true)
  const [mfaUnenrolling, setMfaUnenrolling] = useState(false)
  const [mfaError, setMfaError] = useState<string | null>(null)
  const tm = useTranslations('mfa')

  // Inline enrollment state
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaQrUrl, setMfaQrUrl] = useState<string | null>(null)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaVerifying, setMfaVerifying] = useState(false)
  const [mfaShowSecret, setMfaShowSecret] = useState(false)

  const filteredModels = allModels.filter((m) => m.endpoint_id === selectedEndpointId)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    async function checkMfa() {
      const { data } = await supabase.auth.mfa.listFactors()
      setMfaEnabled((data?.totp?.length ?? 0) > 0)
      setMfaLoading(false)
    }
    checkMfa()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      setEmail(user.email)

      const [{ data: userData }, { data: eps }, { data: mds }] = await Promise.all([
        supabase
          .from('users')
          .select('display_name, role, telegram_id, teams_user_id, ai_model_id, theme, locale')
          .eq('email', user.email)
          .single(),
        supabase
          .from('ai_endpoints')
          .select('id, name, is_active')
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
        supabase
          .from('ai_models')
          .select('id, endpoint_id, model_id, display_name')
          .eq('is_active', true)
          .order('created_at', { ascending: true }),
      ])

      const epList = eps ?? []
      const mdList = mds ?? []
      setEndpoints(epList)
      setAllModels(mdList)

      if (userData) {
        setDisplayName(userData.display_name ?? '')
        setRole(userData.role ?? 'member')
        setTelegramId(userData.telegram_id ? String(userData.telegram_id) : '')
        setTeamsUserId(userData.teams_user_id ?? null)
        const savedLocale = userData.locale as Locale
        if (savedLocale && (SUPPORTED_LOCALES as readonly string[]).includes(savedLocale)) {
          setLocale(savedLocale)
        }

        // Restore selected endpoint/model from saved ai_model_id
        if (userData.ai_model_id) {
          const savedModel = mdList.find((m) => m.id === userData.ai_model_id)
          if (savedModel) {
            setSelectedEndpointId(savedModel.endpoint_id)
            setSelectedModelId(savedModel.id)
          }
        } else if (epList.length > 0) {
          setSelectedEndpointId(epList[0].id)
        }
      }

      setLoading(false)
    }
    load()
    loadAssistants()
    loadEmailPrompt()
    loadAllUsers()
  }, [])

  async function handleMfaStartEnroll() {
    setMfaError(null)
    setMfaEnrolling(true)
    setMfaCode('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error || !data) {
      setMfaError(tm('error'))
      setMfaEnrolling(false)
      return
    }
    const qrUrl = await QRCode.toDataURL(data.totp.uri, { width: 180, margin: 2 })
    setMfaQrUrl(qrUrl)
    setMfaSecret(data.totp.secret)
    setMfaFactorId(data.id)
  }

  async function handleMfaVerify() {
    if (!mfaFactorId || mfaCode.length !== 6) return
    setMfaVerifying(true)
    setMfaError(null)
    const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
    if (challengeErr || !challengeData) {
      setMfaError(tm('error'))
      setMfaVerifying(false)
      return
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challengeData.id,
      code: mfaCode,
    })
    setMfaVerifying(false)
    if (verifyErr) {
      setMfaError(tm('invalidCode'))
      return
    }
    setMfaEnabled(true)
    setMfaEnrolling(false)
    setMfaQrUrl(null)
    setMfaSecret(null)
    setMfaFactorId(null)
    setMfaCode('')
  }

  function handleMfaCancelEnroll() {
    setMfaEnrolling(false)
    setMfaQrUrl(null)
    setMfaSecret(null)
    setMfaFactorId(null)
    setMfaCode('')
    setMfaError(null)
  }

  async function handleMfaUnenroll() {
    if (!confirm(tm('unenrollConfirm'))) return
    setMfaUnenrolling(true)
    setMfaError(null)
    const { data } = await supabase.auth.mfa.listFactors()
    const factor = data?.totp?.[0]
    if (!factor) { setMfaUnenrolling(false); return }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error) {
      setMfaError(tm('error'))
    } else {
      setMfaEnabled(false)
    }
    setMfaUnenrolling(false)
  }

  async function loadEmailPrompt() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return
    const { data } = await supabase
      .from('user_prompts')
      .select('content')
      .eq('user_id', user.id)
      .eq('key', 'email_generate')
      .single()
    const content = data?.content ?? ''
    setEmailPrompt(content)
    setSavedEmailPrompt(content)
  }

  async function handleSaveEmailPrompt() {
    setSavingEmailPrompt(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) { setSavingEmailPrompt(false); return }
    const content = emailPrompt.trim()
    if (content === '') {
      await supabase.from('user_prompts').delete().eq('user_id', user.id).eq('key', 'email_generate')
    } else {
      await supabase.from('user_prompts').upsert(
        { user_id: user.id, key: 'email_generate', content },
        { onConflict: 'user_id,key' }
      )
    }
    setSavedEmailPrompt(content)
    setSavingEmailPrompt(false)
    setSavedEmailPromptFlag(true)
    setTimeout(() => setSavedEmailPromptFlag(false), 2000)
  }

  async function loadAllUsers() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return
    const { data } = await supabase
      .from('users')
      .select('email, display_name')
      .neq('email', user.email)
      .order('display_name')
    setAllUsers(data ?? [])
  }

  async function loadAssistants() {
    const res = await fetch('/api/assistants')
    if (res.ok) {
      const data = await res.json()
      setAssistants(data.assistants ?? [])
    }
  }

  async function handleToggleAssistant(assistantEmail: string) {
    setAssistantError(null)
    const isCurrently = assistants.some(a => a.assistant_email === assistantEmail)
    if (isCurrently) {
      await fetch('/api/assistants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistant_email: assistantEmail }),
      })
    } else {
      const res = await fetch('/api/assistants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistant_email: assistantEmail }),
      })
      if (!res.ok) {
        const data = await res.json()
        setAssistantError(data.error ?? t('addFailed'))
        return
      }
    }
    loadAssistants()
  }

  // When endpoint changes, reset model selection to first available
  function handleEndpointChange(epId: string) {
    setSelectedEndpointId(epId)
    const first = allModels.find((m) => m.endpoint_id === epId)
    setSelectedModelId(first?.id ?? '')
  }

  async function handleSave() {
    setError(null); setSaved(false)

    const parsed = telegramId.trim() ? Number(telegramId.trim()) : null
    if (telegramId.trim() && (isNaN(parsed!) || !Number.isInteger(parsed))) {
      setError(t('telegramIdNumeric')); return
    }

    setSaving(true)
    const [{ error: err }] = await Promise.all([
      supabase
        .from('users')
        .update({
          telegram_id: parsed,
          ai_model_id: selectedModelId || null,
          theme: theme ?? 'light',
          locale,
        })
        .eq('email', email),
      fetch('/api/set-locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      }),
    ])

    setSaving(false)
    if (err) {
      setError(err.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    }
  }

  if (loading) return <div className="text-sm text-gray-400">{tc('loading')}</div>

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t('title')}</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">

        {/* Account info (read-only) */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('email')}</label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{email}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('displayName')}</label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{displayName || '—'}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('role')}</label>
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${
              role === 'super_admin'
                ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}>
              {t(`roles.${role as 'super_admin' | 'member'}`)}
            </span>
          </div>
        </div>

        <hr className="border-gray-100 dark:border-gray-800" />

        {/* Telegram ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('telegramId')}
          </label>
          <input
            type="text"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder={t('telegramIdPlaceholder')}
            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">{t('telegramHint')}</p>
        </div>

        {/* Teams Bot Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('teamsBot')}
          </label>
          {teamsUserId ? (
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 font-medium">
              ✅ {t('teamsBound')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              ⬜ {t('teamsUnbound')}
            </span>
          )}
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">{t('teamsHint')}</p>
        </div>

        {/* AI Model (two-layer) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('aiModel')}
          </label>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('endpointLabel')}</label>
              <select
                value={selectedEndpointId}
                onChange={(e) => handleEndpointChange(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {endpoints.length === 0 && <option value="">{t('selectEndpoint')}</option>}
                {endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>{ep.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('modelLabel')}</label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={filteredModels.length === 0}
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {filteredModels.length === 0 && <option value="">{t('selectModel')}</option>}
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
            此設定會影響 Bot 及網頁名片辨識所使用的 AI 模型。
          </p>
        </div>

        {/* Theme */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('theme')}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                mounted && theme === 'light'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Sun size={15} /> {t('light')}
              {mounted && theme === 'light' && <Check size={13} />}
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                mounted && theme === 'dark'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Moon size={15} /> {t('dark')}
              {mounted && theme === 'dark' && <Check size={13} />}
            </button>
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('language')}
          </label>
          <div className="flex gap-2 flex-wrap">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocale(loc)}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors ${
                  locale === loc
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {LOCALE_LABELS[loc]}
                {locale === loc && <Check size={13} />}
              </button>
            ))}
          </div>
        </div>

        {/* Assistants */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('assistants')}
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{t('assistantsHint')}</p>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Selected assistants as removable tags */}
            {assistants.map(a => (
              <span
                key={a.assistant_email}
                className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-full border border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium"
              >
                {a.users?.display_name ?? a.assistant_email.split('@')[0]}
                <button
                  type="button"
                  onClick={() => handleToggleAssistant(a.assistant_email)}
                  className="ml-0.5 hover:text-blue-900 dark:hover:text-blue-100"
                  title={t('remove')}
                >
                  <X size={12} />
                </button>
              </span>
            ))}

            {/* Add button */}
            {allUsers.filter(u => !assistants.some(a => a.assistant_email === u.email)).length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAssistantPicker(v => !v)}
                  className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  <Plus size={12} /> 新增助理
                  <ChevronDown size={12} className={`transition-transform ${showAssistantPicker ? 'rotate-180' : ''}`} />
                </button>
                {showAssistantPicker && (
                  <div className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 py-1">
                    {allUsers
                      .filter(u => !assistants.some(a => a.assistant_email === u.email))
                      .map(u => (
                        <button
                          key={u.email}
                          type="button"
                          onClick={() => { handleToggleAssistant(u.email); setShowAssistantPicker(false) }}
                          title={u.email}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          {u.display_name ?? u.email.split('@')[0]}
                          <span className="block text-xs text-gray-400 truncate">{u.email}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {assistants.length === 0 && allUsers.length === 0 && (
              <p className="text-xs text-gray-400">{t('noAssistants')}</p>
            )}
          </div>
          {assistantError && <p className="mt-2 text-xs text-red-500">{assistantError}</p>}
        </div>

        {/* MFA */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {mfaEnabled
                ? <ShieldCheck size={16} className="text-green-500" />
                : <ShieldOff size={16} className="text-gray-400" />
              }
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{tm('title')}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                mfaEnabled
                  ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}>
                {mfaLoading ? '...' : mfaEnabled ? tm('enabled') : tm('disabled')}
              </span>
            </div>
            {!mfaLoading && (
              mfaEnabled ? (
                <button
                  onClick={handleMfaUnenroll}
                  disabled={mfaUnenrolling}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {mfaUnenrolling ? tm('loading') : tm('unenroll')}
                </button>
              ) : !mfaEnrolling ? (
                <button
                  onClick={handleMfaStartEnroll}
                  className="text-xs text-blue-600 hover:text-blue-800 dark:hover:text-blue-400 transition-colors"
                >
                  {tm('enable')}
                </button>
              ) : null
            )}
          </div>

          {/* Inline enrollment panel */}
          {mfaEnrolling && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
              {mfaQrUrl ? (
                <>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{tm('scanQr')}</p>
                  <img src={mfaQrUrl} alt="TOTP QR" className="w-[180px] h-[180px] rounded-lg border border-gray-200 dark:border-gray-700" />

                  {/* Manual secret */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setMfaShowSecret(v => !v)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {mfaShowSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                      {tm('manualEntry')}
                    </button>
                    {mfaShowSecret && (
                      <p className="mt-1 text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-300 break-all select-all">
                        {mfaSecret}
                      </p>
                    )}
                  </div>

                  {/* Code input */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{tm('enterCode')}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={mfaCode}
                      onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={e => e.key === 'Enter' && handleMfaVerify()}
                      placeholder="000000"
                      className="w-36 text-center text-lg font-mono tracking-widest px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleMfaVerify}
                      disabled={mfaVerifying || mfaCode.length !== 6}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {mfaVerifying ? <Loader2 size={13} className="animate-spin" /> : null}
                      {tm('verify')}
                    </button>
                    <button
                      onClick={handleMfaCancelEnroll}
                      className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    >
                      {tm('cancel')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" />
                  {tm('loading')}
                </div>
              )}
            </div>
          )}

          {mfaError && <p className="mt-1 text-xs text-red-500">{mfaError}</p>}
        </div>

        {/* Email Generate Prompt */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-5">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              個人 Email 生成 Prompt
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEmailPrompt('')}
                className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                title={t('resetToDefault')}
              >
                <RotateCcw size={12} /> {t('resetToDefault')}
              </button>
              <button
                onClick={handleSaveEmailPrompt}
                disabled={savingEmailPrompt || emailPrompt === savedEmailPrompt}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savedEmailPromptFlag ? <Check size={12} /> : null}
                {savingEmailPrompt ? t('saving') : savedEmailPromptFlag ? t('saved') : tc('save')}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
            覆蓋組織預設的 Email 生成指令。留空則使用組織設定或系統預設。
          </p>
          <textarea
            value={emailPrompt}
            onChange={(e) => setEmailPrompt(e.target.value)}
            rows={5}
            placeholder={t('emailPromptPlaceholder')}
            className="w-full text-sm font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          {emailPrompt === '' && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('systemDefaultInEffect')}</p>
              <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-pre-wrap overflow-auto max-h-24">
                {SYSTEM_PROMPTS.email_generate}
              </pre>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {saved && (
          <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <Check size={14} /> {t('saved')}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {saving ? t('saving') : tc('save')}
        </button>
      </div>
    </div>
  )
}
