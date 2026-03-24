import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get('lat')
  const lon = req.nextUrl.searchParams.get('lon')
  if (!lat || !lon) return NextResponse.json({ location: null }, { status: 400 })

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh-TW`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'myCRM/1.0 (contact management app)' },
    })
    if (!res.ok) return NextResponse.json({ location: null })

    const data = await res.json() as { address?: Record<string, string>; display_name?: string }
    const a = data.address
    if (!a) return NextResponse.json({ location: data.display_name ?? null })

    const parts = [
      a.city ?? a.town ?? a.village ?? a.county,
      a.state ?? a.province,
      a.country,
    ].filter(Boolean)

    return NextResponse.json({ location: parts.join('，') || data.display_name || null })
  } catch {
    return NextResponse.json({ location: null })
  }
}
