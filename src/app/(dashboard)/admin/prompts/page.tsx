'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { SYSTEM_PROMPTS, type PromptKey } from '@/lib/prompts'
import { Check, RotateCcw } from 'lucide-react'

const PROMPT_KEYS: PromptKey[] = ['ocr_card', 'task_parse', 'email_generate', 'docs_generate']

const PROMPT_LABELS: Record<PromptKey, { title: string; desc: string; userEditable: boolean }> = {
  ocr_card:       { title: '名片 OCR', desc: '辨識名片圖片時傳給 AI 的系統指令', userEditable: false },
  task_parse:     { title: '任務解析', desc: 'Bot 解析任務描述時使用的指令', userEditable: false },
  email_generate: { title: 'Email 生成', desc: '生成商務郵件內文時使用的指令', userEditable: true },
  docs_generate:  { title: '說明書生成', desc: '生成使用說明文件時使用的指令', userEditable: false },
}

interface OrgPrompt {
  key: PromptKey
  content: string
}

export default function AdminPromptsPage() {
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

  if (loading) return <div className="text-sm text-gray-400 dark:text-gray-500 p-8">載入中…</div>

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Prompt 管理</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          設定 AI 提示詞。留空則使用系統預設。個人可編輯的 Prompt 另可在個人設定中覆蓋。
        </p>
      </div>

      <div className="space-y-6">
        {PROMPT_KEYS.map((key) => {
          const meta = PROMPT_LABELS[key]
          const isChanged = editing[key] !== orgPrompts[key]
          const isDefault = editing[key] === ''
          const effectivePrompt = isDefault ? SYSTEM_PROMPTS[key] : editing[key]

          return (
            <div key={key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{meta.title}</h2>
                    {meta.userEditable && (
                      <span className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">個人可覆蓋</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{meta.desc}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleReset(key)}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    title="清除組織設定，還原為系統預設"
                  >
                    <RotateCcw size={13} /> 還原預設
                  </button>
                  <button
                    onClick={() => handleSave(key)}
                    disabled={saving === key || !isChanged}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saved === key ? <Check size={13} /> : null}
                    {saving === key ? '儲存中…' : saved === key ? '已儲存' : '儲存'}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  組織自訂 Prompt（留空使用系統預設）
                </label>
                <textarea
                  value={editing[key]}
                  onChange={(e) => setEditing((prev) => ({ ...prev, [key]: e.target.value }))}
                  rows={6}
                  placeholder="留空則使用系統預設"
                  className="w-full text-sm font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              {isDefault && (
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 dark:text-gray-500">系統預設（唯讀預覽）</label>
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
  )
}
