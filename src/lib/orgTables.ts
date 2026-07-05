/**
 * v8.0 多租戶化 — org-scoped 業務表清單（單一真相來源）
 *
 * 與 `supabase/migrations/20260705000300_phase0_business_org_id.sql` 的 43 張表
 * 一一對應：這些表在 DB 有 `org_id` 欄（FK → organizations、DEFAULT = default org），
 * `orgScopedClient()` 會對它們自動注入 org 過濾與 insert org_id。
 *
 * 不在清單（全域表，勿加入）：users、system_settings、countries、ai_endpoints、
 * ai_models、gemini_models、medical_departments、docs_content、gmail_oauth、
 * bot_errors、cron_runs、usage_counters；租戶表 organizations／organization_members／
 * organization_invites 本身也不在此清單。
 *
 * 新業務表上線時：migration 加 org_id ＋ 本清單加表名（scripts/lint-org-scope.mjs
 * 會解析本檔案的字串常值）。
 */
export const ORG_TABLE_NAMES = [
  // PRD 45.2 原列業務表
  'contacts',
  'contact_cards',
  'contact_photos',
  'contact_tags',
  'tags',
  'tasks',
  'task_assignees',
  'interaction_logs',
  'email_templates',
  'template_attachments',
  'prompts',
  'user_prompts',
  'pending_contacts',
  'camcard_pending',
  'duplicate_pairs',
  'failed_scans',
  'feedback',
  'agent_tokens',
  'agent_actions',
  'report_schedules',
  'bot_sessions',
  'telegram_dedup',
  // newsletter 家族
  'newsletter_blacklist',
  'newsletter_campaigns',
  'newsletter_compose_cache',
  'newsletter_drafts',
  'newsletter_events',
  'newsletter_lists',
  'newsletter_period_meta',
  'newsletter_recipients',
  'newsletter_subscriber_lists',
  'newsletter_subscribers',
  'newsletter_tone_samples',
  'newsletter_unsubscribes',
  // PRD 撰寫後新增的業務表
  'contact_briefings',
  'meeting_drafts',
  'face_embeddings',
  'photo_faces',
  'saved_views',
  'user_assistants',
  'email_campaigns',
  'email_events',
  'admin_actions',
] as const

export const ORG_TABLES: ReadonlySet<string> = new Set(ORG_TABLE_NAMES)
