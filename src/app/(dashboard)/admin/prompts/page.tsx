'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { SYSTEM_PROMPTS, type PromptKey } from '@/lib/prompt-constants'
import { Check, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PermissionGate } from '@/components/PermissionGate'

const PROMPT_KEYS: PromptKey[] = ['ocr_card', 'task_parse', 'email_generate', 'docs_generate', 'meeting_parse']

const PROMPT_USER_EDITABLE: Record<PromptKey, boolean> = {
  ocr_card:       false,
  task_parse:     false,
  email_generate: true,
  docs_generate:  false,
  meeting_parse:  false,
}

interface OrgPrompt {
  key: PromptKey
  content: string
}

export default function AdminPromptsPage() {
  const t = useTranslations('prompts')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()
  const [orgPrompts, setOrgPrompts] = useState<Record<PromptKey, string>>({} as Record<PromptKey, string>)
  const [editing, setEditing] = useState<Record<PromptKey, string>>({} as Record<PromptKey, string>)
  const [saving, setSaving] = useState<PromptKey | null>(null)
  const [saved, setSaved] = useState<PromptKey | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadPrompts() }, [])

  async function loadPrompts() {
    setLoading(true)
    const { data } = await supabase
      .from('prompts')
      .select('key, content')
      .in('key', PROMPT_KEYS)

    const map: Record<string, string> = {}
    data?.forEach((r: OrgPrompt) => { map[r.key] = r.content })

    const defaults = {} as Record<PromptKey, string>
    const editingInit = {} as Record<PromptKey, string>
    for (const key of PROMPT_KEYS) {
      defaults[key] = map[key] ?? ''
      editingInit[key] = map[key] ?? ''
    }
    setOrgPrompts(defaults)
    setEditing(editingInit)
    setLoading(false)
  }

  async function handleSave(key: PromptKey) {
    setSaving(key)
    const content = editing[key].trim()

    if (content === '') {
      // Delete org override → fall back to system default
      await supabase.from('prompts').delete().eq('key', key)
    } else {
      await supabase.from('prompts').upsert({ key, content }, { onConflict: 'key' })
    }

    setOrgPrompts((prev) => ({ ...prev, [key]: content }))
    setSaving(null)
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }

  function handleReset(key: PromptKey) {
    setEditing((prev) => ({ ...prev, [key]: '' }))
  }

  if (loading) return <div className="text-sm text-gray-400 dark:text-gray-500 p-8">{tc('loading')}</div>

  return (
    <PermissionGate feature="prompts">
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
      </div>

      <div className="space-y-6">
        {PROMPT_KEYS.map((key) => {
          const isUserEditable = PROMPT_USER_EDITABLE[key]
          const keyMeta = t.raw(`keys.${key}`) as { title: string; desc: string }
          const isChanged = editing[key] !== orgPrompts[key]
          const isDefault = editing[key] === ''

          return (
            <div key={key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{keyMeta.title}</h2>
                    {isUserEditable && (
                      <span className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">{t('userEditable')}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{keyMeta.desc}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleReset(key)}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    title={t('resetTitle')}
                  >
                    <RotateCcw size={13} /> {t('resetDefault')}
                  </button>
                  <button
                    onClick={() => handleSave(key)}
                    disabled={saving === key || !isChanged}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saved === key ? <Check size={13} /> : null}
                    {saving === key ? t('saving') : saved === key ? t('saved') : t('save')}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  {t('orgPromptLabel')}
                </label>
                <textarea
                  value={editing[key]}
                  onChange={(e) => setEditing((prev) => ({ ...prev, [key]: e.target.value }))}
                  rows={6}
                  placeholder={t('placeholder')}
                  className="w-full text-sm font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              {isDefault && (
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 dark:text-gray-500">{t('systemDefaultLabel')}</label>
                  <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-pre-wrap overflow-auto max-h-40">
                    {SYSTEM_PROMPTS[key]}
                  </pre>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
    </PermissionGate>
  )
}
