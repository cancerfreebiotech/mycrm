import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET — fetch all contacts (bypasses PostgREST 1000-row limit)
export async function GET() {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, company, job_title, email, phone, country_code, met_at, created_at, importance, language, users!created_by(display_name), contact_tags(tags(id, name))')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
