export const SUPPORTED_LOCALES = ['zh-TW', 'en', 'ja'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh-TW'
export const LOCALE_COOKIE = 'MYCRM_LOCALE'
