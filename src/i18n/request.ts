import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export const SUPPORTED_LOCALES = ['zh-TW', 'en', 'ja'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh-TW'
export const LOCALE_COOKIE = 'MYCRM_LOCALE'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const raw = cookieStore.get(LOCALE_COOKIE)?.value ?? ''
  const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(raw)
    ? (raw as Locale)
    : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
