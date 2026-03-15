import { NextRequest, NextResponse } from 'next/server'
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from '@/i18n/config'

export async function POST(req: NextRequest) {
  const { locale } = await req.json()
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  return res
}
