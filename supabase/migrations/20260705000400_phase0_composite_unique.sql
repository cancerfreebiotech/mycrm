-- ============================================================
-- 複合唯一鍵（org_id, x）— v8.0 Phase 0（Task 174）
-- 執行日期：2026-07-05
--
-- 策略：「並存」而非「取代」。既有 UNIQUE(x) 全部保留、另建
-- UNIQUE(org_id, x) 唯一索引：
--   - 程式碼所有 .upsert(onConflict: 'x') 依賴既有約束，取代會立刻炸掉；
--     且 Phase 0 期間新列的 org_id 來自 DEFAULT，單租戶下 UNIQUE(x)
--     嚴格強於 UNIQUE(org_id, x)，先並存零行為改變。
--   - Phase 2（Task 181 前後）把程式碼的 onConflict 目標改為含 org_id
--     後，才 DROP 單欄版本，屆時跨租戶撞鍵問題（PRD 風險 #4）才真正
--     需要複合版本接手。
--
-- 不建複合版本的既有 UNIQUE（理由）：
--   - agent_tokens(token_hash)：隨機 secret 的全域唯一是預期行為，
--     token 查驗發生在 org 已知之前。
--   - photo_faces(photo_id, contact_id)、task_assignees(task_id,
--     assignee_email)：鍵首欄已是 org 所屬實體的 FK，天然 org 隔離。
--   - 全域表（countries、docs_content、gemini_models、medical_departments、
--     users）與租戶表 organizations 不在範圍。
--
-- 冪等：IF NOT EXISTS，可安全重跑。
-- ============================================================

create unique index if not exists uq_bot_sessions_org_telegram_id     on public.bot_sessions(org_id, telegram_id);
create unique index if not exists uq_newsletter_blacklist_org_email   on public.newsletter_blacklist(org_id, email);
create unique index if not exists uq_newsletter_lists_org_key         on public.newsletter_lists(org_id, key);
create unique index if not exists uq_newsletter_subscribers_org_email on public.newsletter_subscribers(org_id, email);
create unique index if not exists uq_newsletter_unsubscribes_org_email on public.newsletter_unsubscribes(org_id, email);
create unique index if not exists uq_prompts_org_key                  on public.prompts(org_id, key);
create unique index if not exists uq_tags_org_name                    on public.tags(org_id, name);
create unique index if not exists uq_user_assistants_org_mgr_asst     on public.user_assistants(org_id, manager_email, assistant_email);
create unique index if not exists uq_user_prompts_org_user_key        on public.user_prompts(org_id, user_id, key);

-- 部分唯一索引（partial unique）也要有複合對應
create unique index if not exists uq_newsletter_campaigns_org_slug
  on public.newsletter_campaigns(org_id, slug) where slug is not null;
create unique index if not exists uq_newsletter_drafts_org_highlight_period
  on public.newsletter_drafts(org_id, period) where section = 'highlight' and status <> 'deleted';
