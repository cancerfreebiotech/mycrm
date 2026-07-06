-- ============================================================
-- template-attachments bucket 轉 private — v8.0 Task 182
-- 執行日期：2026-07-06（⚠️ 必須在 v7.9.3 程式碼（簽名下載連結）部署完成
-- 「之後」才套用——舊程式碼的 <a href={public URL}> 會在翻私有後 400）
--
-- newsletter-assets 刻意維持 public：其 URL 烙進寄出的 email 與公開 RSS，
-- 永不能過期（Task 182 對它只做上傳前綴與寫入面 org policy）。
-- ============================================================

update storage.buckets set public = false where id = 'template-attachments';
