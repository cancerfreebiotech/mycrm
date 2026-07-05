import type { OrgDb } from '@/lib/orgContext'

// Privileged-action audit log helper.
// Inserts one row into `admin_actions` (RLS: service-role only).
// Audit failures MUST NOT block business logic — we log to console.error and swallow.

interface AdminActionInput {
  actorEmail: string
  action: string
  target?: string | null
  detail?: Record<string, unknown> | null
}

export async function logAdminAction(
  service: OrgDb,
  { actorEmail, action, target = null, detail = null }: AdminActionInput,
): Promise<void> {
  const { error } = await service.from('admin_actions').insert({
    actor_email: actorEmail,
    action,
    target,
    detail,
  })
  if (error) {
    console.error('[adminAudit] failed to log admin action', { action, target, error: error.message })
  }
}
