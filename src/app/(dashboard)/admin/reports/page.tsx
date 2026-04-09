'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

interface Schedule {
  id: string
  name: string
  frequency: 'weekly' | 'monthly' | 'custom'
  cron_expr: string
  date_range_days: number
  recipients: string[]
  is_active: boolean
  created_at: string
  owner_id?: string
}

interface Tag { id: string; name: string }

interface LogRow {
  contact: string
  company: string
  type: string
  content: string
  date: string
  time: string
  location: string
}

const FREQ_CRON: Record<string, string> = {
  weekly: '0 9 * * 1',
  monthly: '0 9 1 * *',
  custom: '',
}

export default function ReportsPage() {
  const t = useTranslations('reports')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  // Generate section
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo)
  const [dateTo, setDateTo] = useState(today)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [allCountries, setAllCountries] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [logs, setLogs] = useState<LogRow[] | null>(null)

  const LOG_TYPES = [
    { value: 'meeting', label: '拜訪' },
    { value: 'note', label: '備忘' },
    { value: 'email', label: 'Email' },
  ]

  const COUNTRY_LABELS: Record<string, string> = {
    TW: '🇹🇼 TW', JP: '🇯🇵 JP', US: '🇺🇸 US', KR: '🇰🇷 KR',
    SG: '🇸🇬 SG', HK: '🇭🇰 HK', CN: '🇨🇳 CN', IN: '🇮🇳 IN',
    FR: '🇫🇷 FR', DE: '🇩🇪 DE', CH: '🇨🇭 CH', BE: '🇧🇪 BE',
    AT: '🇦🇹 AT', CY: '🇨🇾 CY',
  }

  // Schedules
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(true)

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    frequency: 'weekly' as 'weekly' | 'monthly' | 'custom',
    cron_expr: FREQ_CRON.weekly,
    date_range_days: 7,
    recipients: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadRole()
    loadSchedules()
    supabase.from('tags').select('id, name').order('name').then(({ data }) => setAllTags(data ?? []))
    supabase.from('contacts').select('country_code').not('country_code', 'is', null).then(({ data }) => {
      const codes = [...new Set((data ?? []).map(c => c.country_code).filter(Boolean))].sort()
      setAllCountries(codes as string[])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadRole() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return
    const { data } = await supabase.from('users').select('role').eq('email', user.email).single()
    setIsSuperAdmin(data?.role === 'super_admin')
  }

  async function loadSchedules() {
    setLoadingSchedules(true)
    const res = await fetch('/api/reports/schedules')
    if (res.ok) {
      const data = await res.json()
      setSchedules(data.schedules ?? [])
    }
    setLoadingSchedules(false)
  }

  async function handleGenerate(format: 'json' | 'excel') {
    setGenerating(true)
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom, dateTo, format, tagIds: selectedTagIds, countryCodes: selectedCountries, types: selectedTypes }),
      })

      if (format === 'excel') {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `report_${dateFrom}_${dateTo}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const data = await res.json()
        setLogs(data.logs ?? [])
      }
    } finally {
      setGenerating(false)
    }
  }

  function openAdd() {
    setEditingId(null)
    setForm({ name: '', frequency: 'weekly', cron_expr: FREQ_CRON.weekly, date_range_days: 7, recipients: '' })
    setShowModal(true)
  }

  function openEdit(s: Schedule) {
    setEditingId(s.id)
    setForm({
      name: s.name,
      frequency: s.frequency,
      cron_expr: s.cron_expr,
      date_range_days: s.date_range_days,
      recipients: s.recipients.join(', '),
    })
    setShowModal(true)
  }

  function handleFrequencyChange(freq: 'weekly' | 'monthly' | 'custom') {
    setForm(f => ({ ...f, frequency: freq, cron_expr: FREQ_CRON[freq] ?? '' }))
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      frequency: form.frequency,
      cron_expr: form.cron_expr.trim(),
      date_range_days: Number(form.date_range_days),
      recipients: form.recipients.split(',').map(s => s.trim()).filter(Boolean),
    }

    const url = editingId ? `/api/reports/schedules/${editingId}` : '/api/reports/schedules'
    const method = editingId ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      setShowModal(false)
      loadSchedules()
    }
  }

  async function handleToggle(s: Schedule) {
    await fetch(`/api/reports/schedules/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    })
    loadSchedules()
  }

  async function handleDelete(id: string) {
    if (!confirm(t('confirmDelete'))) return
    await fetch(`/api/reports/schedules/${id}`, { method: 'DELETE' })
    loadSchedules()
  }

  const freqLabel = (f: string) => {
    if (f === 'weekly') return t('freqWeekly')
    if (f === 'monthly') return t('freqMonthly')
    return t('freqCustom')
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
      </div>

      {/* Generate section */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('sectionGenerate')}</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('dateFrom')}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('dateTo')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {allTags.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">標籤篩選</label>
              <div className="flex flex-wrap gap-1.5 max-w-sm">
                {allTags.map(tag => {
                  const selected = selectedTagIds.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      onClick={() => setSelectedTagIds(prev =>
                        selected ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                      )}
                      className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        selected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400'
                      }`}
                    >
                      {tag.name}
                      {selected && <X size={10} />}
                    </button>
                  )
                })}
              </div>
              {selectedTagIds.length > 0 && (
                <button
                  onClick={() => setSelectedTagIds([])}
                  className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  清除
                </button>
              )}
            </div>
          )}
          {/* Type filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">互動類型</label>
            <div className="flex gap-1.5">
              {LOG_TYPES.map(({ value, label }) => {
                const selected = selectedTypes.includes(value)
                return (
                  <button
                    key={value}
                    onClick={() => setSelectedTypes(prev =>
                      selected ? prev.filter(v => v !== value) : [...prev, value]
                    )}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      selected
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          {/* Country filter */}
          {allCountries.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">國家</label>
              <div className="flex flex-wrap gap-1.5 max-w-xs">
                {allCountries.map(code => {
                  const selected = selectedCountries.includes(code)
                  return (
                    <button
                      key={code}
                      onClick={() => setSelectedCountries(prev =>
                        selected ? prev.filter(c => c !== code) : [...prev, code]
                      )}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        selected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400'
                      }`}
                    >
                      {COUNTRY_LABELS[code] ?? code}
                    </button>
                  )
                })}
              </div>
              {selectedCountries.length > 0 && (
                <button
                  onClick={() => setSelectedCountries([])}
                  className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  清除
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2 self-end">
            <button
              onClick={() => handleGenerate('json')}
              disabled={generating}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {generating ? t('generating') : t('generate')}
            </button>
            <button
              onClick={() => handleGenerate('excel')}
              disabled={generating}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              {t('downloadExcel')}
            </button>
          </div>
        </div>

        {logs !== null && (
          <div className="mt-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('previewLogs', { count: logs.length })}
            </p>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400">{t('noData')}</p>
            ) : (
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      {[t('colLogContact'), t('colCompany'), t('colLogType'), t('colLogContent'), t('colLogDate'), '時間', '地點'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {logs.map((l, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{l.contact}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{l.company}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{l.type}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-xs truncate">{l.content}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-500 whitespace-nowrap">{l.date}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-500">{l.time}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{l.location}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Schedules section */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('sectionSchedule')}</h2>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} /> {t('addSchedule')}
          </button>
        </div>

        {loadingSchedules ? (
          <p className="text-sm text-gray-400">{tc('loading')}</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-gray-400">{t('noSchedules')}</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {[t('colScheduleName'), t('colFrequency'), t('colRecipients'), ...(isSuperAdmin ? [t('colOwner')] : []), t('colStatus'), ''].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {schedules.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{s.name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{freqLabel(s.frequency)}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-xs truncate">{s.recipients.join(', ')}</td>
                    {isSuperAdmin && (
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">{s.owner_id ?? '—'}</td>
                    )}
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleToggle(s)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          s.is_active
                            ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {s.is_active ? t('enabled') : t('disabled')}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(s)}
                          className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingId ? t('editSchedule') : t('addSchedule')}
            </h3>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('nameLabel')}</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('frequencyLabel')}</label>
              <div className="flex gap-2">
                {(['weekly', 'monthly', 'custom'] as const).map(freq => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => handleFrequencyChange(freq)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      form.frequency === freq
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {t(`freq${freq.charAt(0).toUpperCase() + freq.slice(1)}` as 'freqWeekly' | 'freqMonthly' | 'freqCustom')}
                  </button>
                ))}
              </div>
            </div>

            {form.frequency === 'custom' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('cronLabel')}</label>
                <input
                  type="text"
                  value={form.cron_expr}
                  onChange={e => setForm(f => ({ ...f, cron_expr: e.target.value }))}
                  placeholder="0 9 * * 1"
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">{t('cronHint')}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('dateRangeLabel')}</label>
              <input
                type="number"
                min={1}
                max={365}
                value={form.date_range_days}
                onChange={e => setForm(f => ({ ...f, date_range_days: Number(e.target.value) }))}
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('recipientsLabel')}</label>
              <textarea
                rows={2}
                value={form.recipients}
                onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))}
                placeholder="user@example.com, another@example.com"
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {tc('cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {saving ? t('saving') : tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
