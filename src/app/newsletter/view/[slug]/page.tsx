import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'

// Public page for a published newsletter campaign.
// Linked from RSS <item><link>; Substack importer + email-client "view in
// browser" links both come here.

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('newsletter_campaigns')
    .select('title, subject, preview_text')
    .or(`slug.eq.${slug},id.eq.${slug}`)
    .not('published_at', 'is', null)
    .maybeSingle()
  return {
    title: data?.subject ?? data?.title ?? 'Newsletter',
    description: data?.preview_text ?? undefined,
  }
}

export default async function NewsletterViewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('newsletter_campaigns')
    .select('id, title, subject, preview_text, content_html, published_at')
    .or(`slug.eq.${slug},id.eq.${slug}`)
    .not('published_at', 'is', null)
    .maybeSingle()

  if (!data) notFound()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8">
      <div className="max-w-[640px] mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{data.subject ?? data.title}</h1>
          {data.preview_text && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{data.preview_text}</p>
          )}
        </div>
        <div
          className="newsletter-body"
          dangerouslySetInnerHTML={{ __html: (data.content_html as string) ?? '' }}
        />
      </div>
    </div>
  )
}
