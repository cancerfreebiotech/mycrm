'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Country {
  code: string
  name_zh: string
  name_en: string
  name_ja: string
  emoji: string
  is_active: boolean
}

const EMPTY_FORM = { code: '', name_zh: '', name_en: '', name_ja: '', emoji: '' }

export default function AdminCountriesPage() {
  const supabase = createBrowserSupabaseClient()
  const t = useTranslations('countries')
  const tc = useTranslations('common')
  const [countries, setCountries] = useState<Country[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Country | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null)

  useEffect(() => { fetchCountries() }, [])

  async function fetchCountries() {
    setLoading(true)
    const { data } = await supabase.from('countries').select('code, name_zh, name_en, name_ja, emoji, is_active').order('code')
    setCountries(data ?? [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEdit(c: Country) {
    setEditing(c)
    setForm({ code: c.code, name_zh: c.name_zh, name_en: c.name_en, name_ja: c.name_ja, emoji: c.emoji })
    setError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setError(null)
  }

  async function handleSave() {
    const code = form.code.trim().toUpperCase()
    const name_zh = form.name_zh.trim()
    const name_en = form.name_en.trim()
    const name_ja = form.name_ja.trim()
    const emoji = form.emoji.trim()
    if (!code || !name_zh || !name_en) { setError(t('errorRequired')); return }
    if (!/^[A-Z]{2}$/.test(code)) { setError(t('errorCodeFormat')); return }
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        const { error: err } = await supabase.from('countries').update({ name_zh, name_en, name_ja, emoji }).eq('code', editing.code)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('countries').insert({ code, name_zh, name_en, name_ja, emoji, is_active: true })
        if (err) throw err
      }
      closeForm()
      fetchCountries()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorSave'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(code: string, current: boolean) {
    await supabase.from('countries').update({ is_active: !current }).eq('code', code)
    setCountries((prev) => prev.map((c) => c.code === code ? { ...c, is_active: !current } : c))
  }

  async function handleDelete(code: string) {
    await supabase.from('countries').delete().eq('code', code)
    setConfirmDeleteCode(null)
    fetchCountries()
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} /> {t('addCountry')}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 w-16">{t('colCode')}</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 w-8">旗</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{t('colNameZh')}</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">{t('colNameEn')}</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">{t('colNameJa')}</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 w-20">{t('colStatus')}</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400 w-28">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  <Loader2 size={16} className="animate-spin inline" />
                </td>
              </tr>
            ) : countries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t('noCountries')}</td>
              </tr>
            ) : (
              countries.map((c) => (
                <tr key={c.code} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-gray-100">{c.code}</td>
                  <td className="px-4 py-3 text-lg">{c.emoji}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{c.name_zh}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden sm:table-cell">{c.name_en}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">{c.name_ja}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(c.code, c.is_active)}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                        c.is_active
                          ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {c.is_active ? <Check size={11} /> : <X size={11} />}
                      {c.is_active ? t('enabled') : t('disabled')}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-gray-400 hover:text-blue-500 transition-colors"
                        title={tc('edit')}
                      >
                        <Pencil size={14} />
                      </button>
                      {confirmDeleteCode === c.code ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(c.code)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            {tc('confirm')}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteCode(null)}
                            className="text-xs text-gray-400 hover:underline"
                          >
                            {tc('cancel')}
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteCode(c.code)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title={tc('delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {editing ? t('editCountry') : t('newCountry')}
              </h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {t('codeLabel')}
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                    disabled={!!editing}
                    maxLength={2}
                    placeholder={t('codePlaceholder')}
                    className={inputClass + (editing ? ' opacity-50 cursor-not-allowed' : '')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('colEmoji')}</label>
                  <input
                    type="text"
                    value={form.emoji}
                    onChange={(e) => setForm((p) => ({ ...p, emoji: e.target.value }))}
                    placeholder="🇹🇼"
                    className={inputClass + ' text-lg'}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('colNameZh')} *</label>
                <input
                  type="text"
                  value={form.name_zh}
                  onChange={(e) => setForm((p) => ({ ...p, name_zh: e.target.value }))}
                  placeholder={t('namePlaceholder')}
                  className={inputClass}
                  autoFocus={!editing}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('colNameEn')} *</label>
                <input
                  type="text"
                  value={form.name_en}
                  onChange={(e) => setForm((p) => ({ ...p, name_en: e.target.value }))}
                  placeholder="e.g. Taiwan"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('colNameJa')}</label>
                <input
                  type="text"
                  value={form.name_ja}
                  onChange={(e) => setForm((p) => ({ ...p, name_ja: e.target.value }))}
                  placeholder="例：台湾"
                  className={inputClass}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900">
                {tc('cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? t('saving') : tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
