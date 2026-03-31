'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'

interface Tag {
  id: string
  name: string
  count: number
  created_at: string
}

export default function TagsPage() {
  const t = useTranslations('tags')
  const tc = useTranslations('common')
  const supabase = createBrowserSupabaseClient()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadTags() }, [])

  async function loadTags() {
    setLoading(true)
    const { data } = await supabase
      .from('tags')
      .select('id, name, created_at, contact_tags(count)')
      .order('name')
    setTags(
      (data ?? []).map((tag) => ({
        id: tag.id,
        name: tag.name,
        created_at: tag.created_at,
        count: (tag.contact_tags as unknown as { count: number }[])?.[0]?.count ?? 0,
      }))
    )
    setLoading(false)
  }

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setAdding(true); setError(null)
    const { error: err } = await supabase.from('tags').insert({ name })
    if (err) {
      setError(err.message.includes('unique') ? t('errorDuplicate') : err.message)
    } else {
      setNewName('')
      await loadTags()
    }
    setAdding(false)
  }

  async function handleEdit(id: string) {
    const name = editName.trim()
    if (!name) return
    setSavingId(id); setError(null)
    const { error: err } = await supabase.from('tags').update({ name }).eq('id', id)
    if (err) {
      setError(err.message.includes('unique') ? t('errorDuplicate') : err.message)
    } else {
      setEditingId(null)
      await loadTags()
    }
    setSavingId(null)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await supabase.from('tags').delete().eq('id', id)
    setConfirmDeleteId(null)
    setTags((prev) => prev.filter((tag) => tag.id !== id))
    setDeletingId(null)
  }

  return (
    <PermissionGate feature="tags">
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">{t('count', { n: tags.length })}</span>
      </div>

      {/* Add new tag */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={t('namePlaceholder')}
            className="flex-1 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            <Plus size={14} /> {tc('add')}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>}
      </div>

      {/* Tag list */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">{tc('loading')}</p>
        ) : tags.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">{t('noTags')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {[t('colName'), t('colContacts'), t('colCreated'), ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3">
                    {editingId === tag.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(tag.id); if (e.key === 'Escape') setEditingId(null) }}
                        className="text-sm px-2 py-1 border border-blue-400 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                      />
                    ) : (
                      <span className="inline-flex items-center text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full font-medium">
                        {tag.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{t('contactCount', { n: tag.count })}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(tag.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {editingId === tag.id ? (
                        <>
                          <button onClick={() => handleEdit(tag.id)} disabled={savingId === tag.id}
                            className="text-green-600 hover:text-green-700 dark:text-green-400 disabled:opacity-40">
                            <Check size={15} />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <X size={15} />
                          </button>
                        </>
                      ) : confirmDeleteId === tag.id ? (
                        <>
                          <span className="text-xs text-red-500 dark:text-red-400">{t('confirmDelete')}</span>
                          <button onClick={() => handleDelete(tag.id)} disabled={deletingId === tag.id}
                            className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-40">{tc('confirm')}</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400 hover:text-gray-600">{tc('cancel')}</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingId(tag.id); setEditName(tag.name); setError(null) }}
                            className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => setConfirmDeleteId(tag.id)}
                            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </PermissionGate>
  )
}
