import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext } from '@/lib/orgContext'
import { processCardImage } from '@/lib/imageProcessor'
import { parseLinkedInScreenshot } from '@/lib/gemini'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { image } = await req.json()
    if (!image) return NextResponse.json({ error: 'Missing image' }, { status: 400 })

    const service = createServiceClient()
    const { data: profile } = await service
      .from('users')
      .select('ai_model_id')
      .eq('id', user.id)
      .single()

    const imgBuffer = Buffer.from(image, 'base64')
    const parsed = await parseLinkedInScreenshot(imgBuffer, profile?.ai_model_id ?? null)

    // Name fallback: use English name if no local language name
    if (!parsed.name && parsed.name_en) parsed.name = parsed.name_en

    // Upload screenshot to Storage
    const ctx = await getOrgContext()
    let card_img_url: string | null = null
    try {
      const compressed = await processCardImage(imgBuffer)
      const storagePath = `${ctx.orgId}/cards/linkedin_${user.id}_${Date.now()}.jpg`
      const { error: uploadError } = await service.storage
        .from('cards').upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: false })
      if (!uploadError) {
        const { data: publicUrlData } = service.storage.from('cards').getPublicUrl(storagePath)
        card_img_url = publicUrlData.publicUrl
      }
    } catch {
      // Screenshot upload failure is non-fatal
    }

    return NextResponse.json({ ...parsed, card_img_url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const maxDuration = 300
