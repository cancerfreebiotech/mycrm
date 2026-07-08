-- ============================================================
-- AI 端點型態 + 端點/模型測試紀錄欄位（v8.0.0）
-- 執行日期：2026-07-08
--
-- kind：端點協定型態。
--   * 'google'  → @google/generative-ai SDK 直連（支援 function calling / googleSearch grounding）
--   * 'openai'  → POST {base_url}/chat/completions（OpenAI 相容：Portkey、OpenRouter、
--                 地端 Ollama / vLLM / LM Studio 等；api_key 可空 = 不帶 Authorization）
-- last_test*：/api/ai-test 寫回的最近測試結果，UI 常駐顯示。
-- ============================================================

alter table public.ai_endpoints
  add column if not exists kind text not null default 'openai',
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_test_ok boolean,
  add column if not exists last_test_error text;

do $$ begin
  alter table public.ai_endpoints
    add constraint ai_endpoints_kind_check check (kind in ('openai', 'google'));
exception when duplicate_object then null; end $$;

alter table public.ai_models
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_test_ok boolean,
  add column if not exists last_test_error text;

-- 既有端點回填：base_url 含 googleapis 或名稱含 gemini/google → 'google'，
-- 其餘（含 Portkey gateway，chat/completions 相容）維持 'openai'。
-- 回填後由管理端測試按鈕人工驗證。
update public.ai_endpoints
set kind = 'google'
where base_url ilike '%googleapis%'
   or name ilike '%gemini%'
   or name ilike '%google%';
