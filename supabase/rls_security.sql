-- ============================================================
-- mycrm 完整 RLS 設計（v3.3.0 — 2026-04-20）
-- Run this AFTER all other migrations in supabase/
--
-- 設計原則：
--   這是公司內部共享 CRM。「登入 = 可信員工，全員看到全部」。
--   特定管理功能用現有 `users.granted_features` 陣列控管。
--   純系統設定類 table（users/ai_endpoints/system_settings ...）
--   限 super_admin 寫入。
--
-- ❗ 跑完本檔後仍有幾個 warnings 是刻意的：
--   - rls_policy_always_true（contacts/contact_tags/... USING(true) 全員共享）
--   - rls_enabled_no_policy（bot_sessions/telegram_dedup 只給 service_role）
--   - extension_in_public（pg_trgm/pg_net/citext；移動風險高不動）
--   - auth_leaked_password_protection（Dashboard 手動打開）
-- ============================================================

-- ============================================================
-- 1. Helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_feature(feature_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT CASE
      WHEN u.role = 'super_admin' THEN true
      ELSE u.granted_features @> ARRAY[feature_key]
    END
    FROM public.users u
    WHERE u.email = (auth.jwt() ->> 'email')),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.email = (auth.jwt() ->> 'email')
      AND u.role = 'super_admin'
  )
$$;

-- ============================================================
-- 2. ai_endpoints — api_key 欄位只給 service_role 讀
-- ============================================================

ALTER TABLE public.ai_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_endpoints_read"  ON public.ai_endpoints;
DROP POLICY IF EXISTS "ai_endpoints_write" ON public.ai_endpoints;
CREATE POLICY "ai_endpoints_read"  ON public.ai_endpoints FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_endpoints_write" ON public.ai_endpoints FOR ALL    TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

REVOKE SELECT ON public.ai_endpoints FROM anon, authenticated;
GRANT SELECT (id, name, base_url, is_active, created_at) ON public.ai_endpoints TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_endpoints TO authenticated;

-- ============================================================
-- 3. Tier 0 — 核心共享 tables（全員讀寫）
-- ============================================================

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contacts_read"   ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;
CREATE POLICY "contacts_read"   ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "contacts_update" ON public.contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- 永久 DELETE 需 has_feature('trash')
CREATE POLICY "contacts_delete" ON public.contacts FOR DELETE TO authenticated USING (has_feature('trash'));

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_tags_all" ON public.contact_tags;
CREATE POLICY "contact_tags_all" ON public.contact_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.contact_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_cards_all" ON public.contact_cards;
CREATE POLICY "contact_cards_all" ON public.contact_cards FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- contact_photos: drop previously overly-permissive policy, replace with per-op
ALTER TABLE public.contact_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage contact_photos" ON public.contact_photos;
DROP POLICY IF EXISTS "contact_photos_read"   ON public.contact_photos;
DROP POLICY IF EXISTS "contact_photos_insert" ON public.contact_photos;
DROP POLICY IF EXISTS "contact_photos_update" ON public.contact_photos;
DROP POLICY IF EXISTS "contact_photos_delete" ON public.contact_photos;
CREATE POLICY "contact_photos_read"   ON public.contact_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "contact_photos_insert" ON public.contact_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "contact_photos_update" ON public.contact_photos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "contact_photos_delete" ON public.contact_photos FOR DELETE TO authenticated USING (true);

ALTER TABLE public.interaction_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "interaction_logs_all" ON public.interaction_logs;
CREATE POLICY "interaction_logs_all" ON public.interaction_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.pending_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pending_contacts_all" ON public.pending_contacts;
CREATE POLICY "pending_contacts_all" ON public.pending_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.gemini_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gemini_models_read"  ON public.gemini_models;
DROP POLICY IF EXISTS "gemini_models_write" ON public.gemini_models;
CREATE POLICY "gemini_models_read"  ON public.gemini_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "gemini_models_write" ON public.gemini_models FOR ALL    TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_models_read"  ON public.ai_models;
DROP POLICY IF EXISTS "ai_models_write" ON public.ai_models;
CREATE POLICY "ai_models_read"  ON public.ai_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_models_write" ON public.ai_models FOR ALL    TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ============================================================
-- 4. Tier 1 — Feature-gated writes
-- ============================================================

-- tags (feature: tags)
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tags_read"  ON public.tags;
DROP POLICY IF EXISTS "tags_write" ON public.tags;
CREATE POLICY "tags_read"  ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "tags_write" ON public.tags FOR ALL    TO authenticated USING (has_feature('tags')) WITH CHECK (has_feature('tags'));

-- countries
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "countries_read"  ON public.countries;
DROP POLICY IF EXISTS "countries_write" ON public.countries;
CREATE POLICY "countries_read"  ON public.countries FOR SELECT TO authenticated USING (true);
CREATE POLICY "countries_write" ON public.countries FOR ALL    TO authenticated USING (has_feature('countries')) WITH CHECK (has_feature('countries'));

-- email_templates + template_attachments (feature: email_templates)
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_templates_read"  ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_write" ON public.email_templates;
CREATE POLICY "email_templates_read"  ON public.email_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "email_templates_write" ON public.email_templates FOR ALL    TO authenticated USING (has_feature('email_templates')) WITH CHECK (has_feature('email_templates'));

ALTER TABLE public.template_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "template_attachments_read"  ON public.template_attachments;
DROP POLICY IF EXISTS "template_attachments_write" ON public.template_attachments;
CREATE POLICY "template_attachments_read"  ON public.template_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "template_attachments_write" ON public.template_attachments FOR ALL    TO authenticated USING (has_feature('email_templates')) WITH CHECK (has_feature('email_templates'));

-- prompts
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prompts_read"  ON public.prompts;
DROP POLICY IF EXISTS "prompts_write" ON public.prompts;
CREATE POLICY "prompts_read"  ON public.prompts FOR SELECT TO authenticated USING (true);
CREATE POLICY "prompts_write" ON public.prompts FOR ALL    TO authenticated USING (has_feature('prompts')) WITH CHECK (has_feature('prompts'));

-- camcard_pending (feature: camcard)
ALTER TABLE public.camcard_pending ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "camcard_pending_read"  ON public.camcard_pending;
DROP POLICY IF EXISTS "camcard_pending_write" ON public.camcard_pending;
CREATE POLICY "camcard_pending_read"  ON public.camcard_pending FOR SELECT TO authenticated USING (true);
CREATE POLICY "camcard_pending_write" ON public.camcard_pending FOR ALL    TO authenticated USING (has_feature('camcard')) WITH CHECK (has_feature('camcard'));

-- duplicate_pairs
ALTER TABLE public.duplicate_pairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "duplicate_pairs_read"  ON public.duplicate_pairs;
DROP POLICY IF EXISTS "duplicate_pairs_write" ON public.duplicate_pairs;
CREATE POLICY "duplicate_pairs_read"  ON public.duplicate_pairs FOR SELECT TO authenticated USING (true);
CREATE POLICY "duplicate_pairs_write" ON public.duplicate_pairs FOR ALL    TO authenticated USING (has_feature('duplicates')) WITH CHECK (has_feature('duplicates'));

-- failed_scans
ALTER TABLE public.failed_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "failed_scans_read"  ON public.failed_scans;
DROP POLICY IF EXISTS "failed_scans_write" ON public.failed_scans;
CREATE POLICY "failed_scans_read"  ON public.failed_scans FOR SELECT TO authenticated USING (true);
CREATE POLICY "failed_scans_write" ON public.failed_scans FOR ALL    TO authenticated USING (has_feature('failed_scans')) WITH CHECK (has_feature('failed_scans'));

-- Newsletter family (feature: newsletter)
ALTER TABLE public.newsletter_campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_recipients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_unsubscribes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_blacklist        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_lists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscriber_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletter_campaigns_read"        ON public.newsletter_campaigns;
DROP POLICY IF EXISTS "newsletter_campaigns_write"       ON public.newsletter_campaigns;
DROP POLICY IF EXISTS "newsletter_recipients_read"       ON public.newsletter_recipients;
DROP POLICY IF EXISTS "newsletter_recipients_write"      ON public.newsletter_recipients;
DROP POLICY IF EXISTS "newsletter_unsubscribes_read"     ON public.newsletter_unsubscribes;
DROP POLICY IF EXISTS "newsletter_unsubscribes_write"    ON public.newsletter_unsubscribes;
DROP POLICY IF EXISTS "newsletter_blacklist_read"        ON public.newsletter_blacklist;
DROP POLICY IF EXISTS "newsletter_blacklist_write"       ON public.newsletter_blacklist;
DROP POLICY IF EXISTS "newsletter_subscribers_read"      ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "newsletter_subscribers_write"     ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "newsletter_lists_read"            ON public.newsletter_lists;
DROP POLICY IF EXISTS "newsletter_lists_write"           ON public.newsletter_lists;
DROP POLICY IF EXISTS "newsletter_subscriber_lists_read" ON public.newsletter_subscriber_lists;
DROP POLICY IF EXISTS "newsletter_subscriber_lists_write" ON public.newsletter_subscriber_lists;

CREATE POLICY "newsletter_campaigns_read"        ON public.newsletter_campaigns        FOR SELECT TO authenticated USING (true);
CREATE POLICY "newsletter_campaigns_write"       ON public.newsletter_campaigns        FOR ALL    TO authenticated USING (has_feature('newsletter')) WITH CHECK (has_feature('newsletter'));
CREATE POLICY "newsletter_recipients_read"       ON public.newsletter_recipients       FOR SELECT TO authenticated USING (true);
CREATE POLICY "newsletter_recipients_write"      ON public.newsletter_recipients       FOR ALL    TO authenticated USING (has_feature('newsletter')) WITH CHECK (has_feature('newsletter'));
CREATE POLICY "newsletter_unsubscribes_read"     ON public.newsletter_unsubscribes     FOR SELECT TO authenticated USING (true);
CREATE POLICY "newsletter_unsubscribes_write"    ON public.newsletter_unsubscribes     FOR ALL    TO authenticated USING (has_feature('newsletter')) WITH CHECK (has_feature('newsletter'));
CREATE POLICY "newsletter_blacklist_read"        ON public.newsletter_blacklist        FOR SELECT TO authenticated USING (true);
CREATE POLICY "newsletter_blacklist_write"       ON public.newsletter_blacklist        FOR ALL    TO authenticated USING (has_feature('newsletter')) WITH CHECK (has_feature('newsletter'));
CREATE POLICY "newsletter_subscribers_read"      ON public.newsletter_subscribers      FOR SELECT TO authenticated USING (true);
CREATE POLICY "newsletter_subscribers_write"     ON public.newsletter_subscribers      FOR ALL    TO authenticated USING (has_feature('newsletter')) WITH CHECK (has_feature('newsletter'));
CREATE POLICY "newsletter_lists_read"            ON public.newsletter_lists            FOR SELECT TO authenticated USING (true);
CREATE POLICY "newsletter_lists_write"           ON public.newsletter_lists            FOR ALL    TO authenticated USING (has_feature('newsletter')) WITH CHECK (has_feature('newsletter'));
CREATE POLICY "newsletter_subscriber_lists_read" ON public.newsletter_subscriber_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "newsletter_subscriber_lists_write" ON public.newsletter_subscriber_lists FOR ALL    TO authenticated USING (has_feature('newsletter')) WITH CHECK (has_feature('newsletter'));

-- ============================================================
-- 5. Tier 2 — super-admin only
-- ============================================================

-- users 表：全部操作僅 super_admin
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_all" ON public.users;
CREATE POLICY "users_all" ON public.users FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- 系統設定
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_settings_read"  ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_write" ON public.system_settings;
CREATE POLICY "system_settings_read"  ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "system_settings_write" ON public.system_settings FOR ALL    TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- 文件
ALTER TABLE public.docs_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "docs_content_read"  ON public.docs_content;
DROP POLICY IF EXISTS "docs_content_write" ON public.docs_content;
CREATE POLICY "docs_content_read"  ON public.docs_content FOR SELECT TO authenticated USING (true);
CREATE POLICY "docs_content_write" ON public.docs_content FOR ALL    TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- 醫院科別
ALTER TABLE public.medical_departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "medical_departments_read"  ON public.medical_departments;
DROP POLICY IF EXISTS "medical_departments_write" ON public.medical_departments;
CREATE POLICY "medical_departments_read"  ON public.medical_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "medical_departments_write" ON public.medical_departments FOR ALL    TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ============================================================
-- 6. Tier 3 — user-scoped
-- ============================================================

-- user_prompts: 每人只看自己
ALTER TABLE public.user_prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_prompts_all" ON public.user_prompts;
CREATE POLICY "user_prompts_all" ON public.user_prompts FOR ALL TO authenticated
  USING     (user_id = (SELECT u.id FROM public.users u WHERE u.email = (auth.jwt() ->> 'email')))
  WITH CHECK(user_id = (SELECT u.id FROM public.users u WHERE u.email = (auth.jwt() ->> 'email')));

-- feedback: 自己看自己的 + super_admin 看全部；UPDATE/DELETE 限 super_admin
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert feedback" ON public.feedback;
DROP POLICY IF EXISTS "feedback_read"   ON public.feedback;
DROP POLICY IF EXISTS "feedback_insert" ON public.feedback;
DROP POLICY IF EXISTS "feedback_update" ON public.feedback;
DROP POLICY IF EXISTS "feedback_delete" ON public.feedback;
CREATE POLICY "feedback_read"   ON public.feedback FOR SELECT TO authenticated USING (
  created_by = (SELECT u.id FROM public.users u WHERE u.email = (auth.jwt() ->> 'email'))
  OR is_super_admin()
);
CREATE POLICY "feedback_insert" ON public.feedback FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT u.id FROM public.users u WHERE u.email = (auth.jwt() ->> 'email'))
);
CREATE POLICY "feedback_update" ON public.feedback FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "feedback_delete" ON public.feedback FOR DELETE TO authenticated USING (is_super_admin());

-- ============================================================
-- 7. Service-role-only tables（開 RLS、無 policy；只走 service role）
-- ============================================================

ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_dedup ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. Function search_path 硬化（防 search_path 注入）
-- ============================================================

ALTER FUNCTION public.dashboard_country_stats()                                                                                      SET search_path = public, pg_temp;
ALTER FUNCTION public.dashboard_tag_stats()                                                                                          SET search_path = public, pg_temp;
ALTER FUNCTION public.find_email_duplicates()                                                                                        SET search_path = public, pg_temp;
ALTER FUNCTION public.find_name_duplicates()                                                                                         SET search_path = public, pg_temp;
ALTER FUNCTION public.find_similar_contact_by_name(search_name text)                                                                 SET search_path = public, pg_temp;
ALTER FUNCTION public.find_similar_contacts(input_name text, threshold double precision)                                             SET search_path = public, pg_temp;
ALTER FUNCTION public.get_auth_user_id_by_email(p_email text)                                                                        SET search_path = public, pg_temp;
ALTER FUNCTION public.get_campaign_recipients(p_campaign_id uuid)                                                                    SET search_path = public, pg_temp;
ALTER FUNCTION public.get_campaign_stats()                                                                                           SET search_path = public, pg_temp;
ALTER FUNCTION public.get_users_mfa_status()                                                                                         SET search_path = public, pg_temp;
ALTER FUNCTION public.update_gmail_oauth_updated_at()                                                                                SET search_path = public, pg_temp;
ALTER FUNCTION public.update_tasks_updated_at()                                                                                      SET search_path = public, pg_temp;
ALTER FUNCTION public.get_interaction_logs_by_tags(p_tag_ids uuid[], p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_created_by uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_interaction_logs_by_tags(p_tag_ids uuid[], p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_created_by uuid, p_country_codes text[], p_types text[]) SET search_path = public, pg_temp;

-- ============================================================
-- 9. Storage bucket policies（cards/camcard/feedback/template-attachments）
--    - 移除「anyone can SELECT / anyone can INSERT」舊 policy
--    - 新 policy：authenticated 可 INSERT/UPDATE/DELETE
--    - SELECT：不需 policy（bucket.public=true 直接 URL 可讀）
-- ============================================================

DROP POLICY IF EXISTS "Public read cards"                           ON storage.objects;
DROP POLICY IF EXISTS "Service role upload cards"                   ON storage.objects;
DROP POLICY IF EXISTS "cards_authenticated_select"                  ON storage.objects;
DROP POLICY IF EXISTS "cards_authenticated_insert"                  ON storage.objects;
DROP POLICY IF EXISTS "cards_authenticated_update"                  ON storage.objects;
DROP POLICY IF EXISTS "cards_authenticated_delete"                  ON storage.objects;
CREATE POLICY "cards_authenticated_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'cards');
CREATE POLICY "cards_authenticated_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'cards') WITH CHECK (bucket_id = 'cards');
CREATE POLICY "cards_authenticated_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'cards');

DROP POLICY IF EXISTS "camcard_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "camcard_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "camcard_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "camcard_authenticated_delete" ON storage.objects;
CREATE POLICY "camcard_authenticated_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'camcard');
CREATE POLICY "camcard_authenticated_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'camcard') WITH CHECK (bucket_id = 'camcard');
CREATE POLICY "camcard_authenticated_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'camcard');

DROP POLICY IF EXISTS "template_attachments_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "template_attachments_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "template_attachments_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "template_attachments_authenticated_delete" ON storage.objects;
CREATE POLICY "template_attachments_authenticated_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'template-attachments');
CREATE POLICY "template_attachments_authenticated_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'template-attachments') WITH CHECK (bucket_id = 'template-attachments');
CREATE POLICY "template_attachments_authenticated_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'template-attachments');

DROP POLICY IF EXISTS "feedback_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "feedback_authenticated_delete" ON storage.objects;
CREATE POLICY "feedback_authenticated_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'feedback');
-- feedback bucket INSERT policy already exists (auth users can upload own feedback screenshots)

-- ============================================================
-- 10. 手動：到 Supabase Dashboard → Authentication → Policies →
--     打開 "Prevent sign-ups with compromised passwords"
--     （不能用 SQL 設定）
-- ============================================================
