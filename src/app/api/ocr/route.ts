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

    const { image, images, model } = await req.json()

    let cardData
    if (images && Array.isArray(images) && images.length > 0) {
      const buffers = images.map((b: string) => Buffer.from(b, 'base64'))
      cardData = await analyzeBusinessCard(buffers, model)
    } else if (image) {
      cardData = await analyzeBusinessCard(Buffer.from(image, 'base64'), model)
    } else {
      return NextResponse.json({ error: 'Missing image' }, { status: 400 })
    }

    return NextResponse.json(cardData)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
