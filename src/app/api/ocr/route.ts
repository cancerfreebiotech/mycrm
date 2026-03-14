import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { analyzeBusinessCard } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { image, model } = await req.json()
    if (!image) {
      return NextResponse.json({ error: 'Missing image' }, { status: 400 })
    }

    const buffer = Buffer.from(image, 'base64')
    const cardData = await analyzeBusinessCard(buffer, model)

    return NextResponse.json(cardData)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
