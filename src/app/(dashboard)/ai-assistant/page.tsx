'use client'

import { useTranslations } from 'next-intl'
import AiAssistantChat from '@/components/AiAssistantChat'

export default function AiAssistantPage() {
  const t = useTranslations('assistant')
  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-9rem)] flex flex-col">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">{t('title')}</h1>
      <div className="flex-1 min-h-0 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900 overflow-hidden flex flex-col">
        <AiAssistantChat className="flex-1 min-h-0" />
      </div>
    </div>
  )
}
