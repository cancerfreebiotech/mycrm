import { redirect } from 'next/navigation'

// Redirect /admin/newsletter/draft → /admin/newsletter/draft/{current YYYY-MM}
export default function DraftIndex() {
  const d = new Date()
  const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  redirect(`/admin/newsletter/draft/${period}`)
}
