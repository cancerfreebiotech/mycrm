'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { MessageCircle, X, Sparkles } from 'lucide-react'
import AiAssistantChat from './AiAssistantChat'

// 全域 AI 助理抽屜：右下浮動鈕，點開 slide-over。掛在 dashboard layout，所有頁可用。
export default function AiAssistantDrawer() {
  const t = useTranslations('assistant')
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('open')}
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center"
      >
        <MessageCircle size={24} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-full sm:w-[420px] max-w-full h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Sparkles size={16} className="text-blue-500" /> {t('title')}
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label={t('close')}
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={18} />
              </button>
            </div>
            <AiAssistantChat className="flex-1 min-h-0" />
          </div>
        </div>
      )}
    </>
  )
}
