# 名片王批次匯入 Script

從本機圖片資料夾批次匯入名片，透過 Claude AI OCR 辨識，結果存入 `camcard_pending` 暫存表，再到 `/admin/camcard` 頁面人工確認後移入正式聯絡人。

## 必要環境變數

確保 `.env.local` 包含：

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
```

## 執行方式

```bash
# 試跑前 10 張（不寫 DB，確認 OCR 格式正確）
npx ts-node scripts/camcard-import/import.ts --dir /path/to/photos --dry-run 10

# 正式執行（全部處理）
npx ts-node scripts/camcard-import/import.ts --dir /path/to/photos

# 斷點續跑（跳過已處理的圖檔）
npx ts-node scripts/camcard-import/import.ts --dir /path/to/photos --resume
```

## 支援的圖片格式

`.jpg` / `.jpeg` / `.png` / `.webp` / `.heic` / `.heif`

## 處理流程

1. 讀取圖片 → 壓縮（1024px / JPEG Q85）
2. 上傳壓縮後圖片至 Supabase Storage `cards` bucket
3. 呼叫 Claude API (`claude-sonnet-4-6`) 進行 OCR 辨識
4. 自動偵測重複聯絡人（相同 Email 或相似姓名）
5. 寫入 `camcard_pending` 暫存表
6. 更新 `progress.json` 斷點記錄

## 進度顯示

```
[進度] 1523 / 5000 張 | ✅ 1498 成功 | ⚠️ 25 失敗 | 預計剩餘 23 分鐘
```

## 產生的檔案

| 檔案 | 說明 |
|------|------|
| `progress.json` | 斷點記錄，`--resume` 時讀取跳過已處理 |
| `failed.txt` | 失敗圖檔清單（檔名 + 錯誤原因） |

## 審查匯入結果

執行完成後前往 Web 管理介面：`/admin/camcard`

- 按公司分組顯示所有待審查名片
- 每筆可選擇：確認新增 / 合併至現有聯絡人 / 略過
- 支援批次確認操作
