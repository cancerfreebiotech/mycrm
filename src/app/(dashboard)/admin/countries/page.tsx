'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Plus, Pencil, Trash2, Check, X, Loader2, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react'
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

// ISO 3166-1 alpha-2 lookup table for auto-fill
const ISO_LOOKUP: Record<string, { name_zh: string; name_en: string; name_ja: string; emoji: string }> = {
  TW: { name_zh: '台灣', name_en: 'Taiwan', name_ja: '台湾', emoji: '🇹🇼' },
  US: { name_zh: '美國', name_en: 'United States', name_ja: 'アメリカ', emoji: '🇺🇸' },
  JP: { name_zh: '日本', name_en: 'Japan', name_ja: '日本', emoji: '🇯🇵' },
  CN: { name_zh: '中國', name_en: 'China', name_ja: '中国', emoji: '🇨🇳' },
  KR: { name_zh: '韓國', name_en: 'South Korea', name_ja: '韓国', emoji: '🇰🇷' },
  HK: { name_zh: '香港', name_en: 'Hong Kong', name_ja: '香港', emoji: '🇭🇰' },
  SG: { name_zh: '新加坡', name_en: 'Singapore', name_ja: 'シンガポール', emoji: '🇸🇬' },
  GB: { name_zh: '英國', name_en: 'United Kingdom', name_ja: 'イギリス', emoji: '🇬🇧' },
  DE: { name_zh: '德國', name_en: 'Germany', name_ja: 'ドイツ', emoji: '🇩🇪' },
  FR: { name_zh: '法國', name_en: 'France', name_ja: 'フランス', emoji: '🇫🇷' },
  CA: { name_zh: '加拿大', name_en: 'Canada', name_ja: 'カナダ', emoji: '🇨🇦' },
  AU: { name_zh: '澳洲', name_en: 'Australia', name_ja: 'オーストラリア', emoji: '🇦🇺' },
  NZ: { name_zh: '紐西蘭', name_en: 'New Zealand', name_ja: 'ニュージーランド', emoji: '🇳🇿' },
  IN: { name_zh: '印度', name_en: 'India', name_ja: 'インド', emoji: '🇮🇳' },
  TH: { name_zh: '泰國', name_en: 'Thailand', name_ja: 'タイ', emoji: '🇹🇭' },
  VN: { name_zh: '越南', name_en: 'Vietnam', name_ja: 'ベトナム', emoji: '🇻🇳' },
  PH: { name_zh: '菲律賓', name_en: 'Philippines', name_ja: 'フィリピン', emoji: '🇵🇭' },
  MY: { name_zh: '馬來西亞', name_en: 'Malaysia', name_ja: 'マレーシア', emoji: '🇲🇾' },
  ID: { name_zh: '印尼', name_en: 'Indonesia', name_ja: 'インドネシア', emoji: '🇮🇩' },
  MX: { name_zh: '墨西哥', name_en: 'Mexico', name_ja: 'メキシコ', emoji: '🇲🇽' },
  BR: { name_zh: '巴西', name_en: 'Brazil', name_ja: 'ブラジル', emoji: '🇧🇷' },
  IT: { name_zh: '義大利', name_en: 'Italy', name_ja: 'イタリア', emoji: '🇮🇹' },
  ES: { name_zh: '西班牙', name_en: 'Spain', name_ja: 'スペイン', emoji: '🇪🇸' },
  NL: { name_zh: '荷蘭', name_en: 'Netherlands', name_ja: 'オランダ', emoji: '🇳🇱' },
  SE: { name_zh: '瑞典', name_en: 'Sweden', name_ja: 'スウェーデン', emoji: '🇸🇪' },
  CH: { name_zh: '瑞士', name_en: 'Switzerland', name_ja: 'スイス', emoji: '🇨🇭' },
  NO: { name_zh: '挪威', name_en: 'Norway', name_ja: 'ノルウェー', emoji: '🇳🇴' },
  DK: { name_zh: '丹麥', name_en: 'Denmark', name_ja: 'デンマーク', emoji: '🇩🇰' },
  FI: { name_zh: '芬蘭', name_en: 'Finland', name_ja: 'フィンランド', emoji: '🇫🇮' },
  PL: { name_zh: '波蘭', name_en: 'Poland', name_ja: 'ポーランド', emoji: '🇵🇱' },
  RU: { name_zh: '俄羅斯', name_en: 'Russia', name_ja: 'ロシア', emoji: '🇷🇺' },
  ZA: { name_zh: '南非', name_en: 'South Africa', name_ja: '南アフリカ', emoji: '🇿🇦' },
  AE: { name_zh: '阿聯', name_en: 'United Arab Emirates', name_ja: 'アラブ首長国連邦', emoji: '🇦🇪' },
  SA: { name_zh: '沙烏地阿拉伯', name_en: 'Saudi Arabia', name_ja: 'サウジアラビア', emoji: '🇸🇦' },
  IL: { name_zh: '以色列', name_en: 'Israel', name_ja: 'イスラエル', emoji: '🇮🇱' },
  PT: { name_zh: '葡萄牙', name_en: 'Portugal', name_ja: 'ポルトガル', emoji: '🇵🇹' },
  TR: { name_zh: '土耳其', name_en: 'Turkey', name_ja: 'トルコ', emoji: '🇹🇷' },
  AR: { name_zh: '阿根廷', name_en: 'Argentina', name_ja: 'アルゼンチン', emoji: '🇦🇷' },
  CL: { name_zh: '智利', name_en: 'Chile', name_ja: 'チリ', emoji: '🇨🇱' },
  CO: { name_zh: '哥倫比亞', name_en: 'Colombia', name_ja: 'コロンビア', emoji: '🇨🇴' },
  EG: { name_zh: '埃及', name_en: 'Egypt', name_ja: 'エジプト', emoji: '🇪🇬' },
  NG: { name_zh: '奈及利亞', name_en: 'Nigeria', name_ja: 'ナイジェリア', emoji: '🇳🇬' },
  PK: { name_zh: '巴基斯坦', name_en: 'Pakistan', name_ja: 'パキスタン', emoji: '🇵🇰' },
  BD: { name_zh: '孟加拉', name_en: 'Bangladesh', name_ja: 'バングラデシュ', emoji: '🇧🇩' },
  MM: { name_zh: '緬甸', name_en: 'Myanmar', name_ja: 'ミャンマー', emoji: '🇲🇲' },
  KH: { name_zh: '柬埔寨', name_en: 'Cambodia', name_ja: 'カンボジア', emoji: '🇰🇭' },
  UA: { name_zh: '烏克蘭', name_en: 'Ukraine', name_ja: 'ウクライナ', emoji: '🇺🇦' },
  CZ: { name_zh: '捷克', name_en: 'Czech Republic', name_ja: 'チェコ', emoji: '🇨🇿' },
  AT: { name_zh: '奧地利', name_en: 'Austria', name_ja: 'オーストリア', emoji: '🇦🇹' },
  BE: { name_zh: '比利時', name_en: 'Belgium', name_ja: 'ベルギー', emoji: '🇧🇪' },
  GR: { name_zh: '希臘', name_en: 'Greece', name_ja: 'ギリシャ', emoji: '🇬🇷' },
  HU: { name_zh: '匈牙利', name_en: 'Hungary', name_ja: 'ハンガリー', emoji: '🇭🇺' },
  RO: { name_zh: '羅馬尼亞', name_en: 'Romania', name_ja: 'ルーマニア', emoji: '🇷🇴' },
}

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
  const [sortField, setSortField] = useState<'code' | 'name_zh' | 'name_en'>('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => { fetchCountries() }, [])

  async function fetchCountries() {
    setLoading(true)
    const { data } = await supabase.from('countries').select('code, name_zh, name_en, name_ja, emoji, is_active').order('code')
    setCountries(data ?? [])
    setLoading(false)
  }

  function handleCodeChange(raw: string) {
    const code = raw.toUpperCase()
    setForm(prev => {
      const lookup = code.length === 2 ? ISO_LOOKUP[code] : null
      if (lookup) {
        return {
          code,
          name_zh: prev.name_zh || lookup.name_zh,
          name_en: prev.name_en || lookup.name_en,
          name_ja: prev.name_ja || lookup.name_ja,
          emoji: prev.emoji || lookup.emoji,
        }
      }
      return { ...prev, code }
    })
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

  function handleSort(field: 'code' | 'name_zh' | 'name_en') {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortedCountries = [...countries].sort((a, b) => {
    const av = a[sortField] ?? ''
    const bv = b[sortField] ?? ''
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  function SortIcon({ field }: { field: 'code' | 'name_zh' | 'name_en' }) {
    if (sortField !== field) return <ChevronsUpDown size={12} className="inline ml-1 text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="inline ml-1 text-blue-500" />
      : <ChevronDown size={12} className="inline ml-1 text-blue-500" />
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
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 w-16 cursor-pointer hover:text-blue-500 select-none" onClick={() => handleSort('code')}>{t('colCode')}<SortIcon field="code" /></th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 w-8">旗</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-500 select-none" onClick={() => handleSort('name_zh')}>{t('colNameZh')}<SortIcon field="name_zh" /></th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell cursor-pointer hover:text-blue-500 select-none" onClick={() => handleSort('name_en')}>{t('colNameEn')}<SortIcon field="name_en" /></th>
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
              sortedCountries.map((c) => (
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
                    onChange={(e) => handleCodeChange(e.target.value)}
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
