---
title: ニュースレター
parent: 管理者
nav_order: 7
---

# ニュースレター（Newsletter）

パス：`/admin/newsletter/campaigns`

一連のフロー：購読者管理 → ニュースレター編集 → テスト送信 → 本番送信 → PDF 出力 → RSS 公開（Substack 自動下書き）。

---

## 購読者（`newsletter_subscribers`）

購読者は CRM 連絡先とは**独立した実体**です。email が subscriber として登録されていればニュースレターを受け取れ、CRM 連絡先である必要はありません。ただし：

- インポート時、同一 email の既存連絡先に**自動連結**（大文字小文字を区別しない）
- 新規または email 更新された連絡先も forward trigger でリンク
- 1 人の subscriber は**複数 list に所属可**（例：`zh-TW` + `zh-TW-marketing`）

### リスト（`newsletter_lists`）

`key` で識別するグループ（例：`zh-TW` / `en` / `ja` / `zh-TW-marketing` / `2604-zh-unsent`）。送信時に list を選択すると全メンバー email に展開。

### CSV インポート

`scripts/import-newsletter-subscribers.mjs`（SendGrid 標準 CSV schema）：
```
EMAIL,FIRST_NAME,LAST_NAME,ADDRESS_LINE_1,...,CREATED_AT,UPDATED_AT,CONTACT_ID
```
- コマンド：`node scripts/import-newsletter-subscribers.mjs --csv path/to/x.csv --list <list-key>`
- 冪等（同一 email は重複せず、list 所属のみ追加）
- 大量インポートは chunk を 500 から 50 / 100 に減らす（`fetch failed` エラー時）

---

## Campaigns 一覧ページ

パス：`/admin/newsletter/campaigns`

全 `newsletter_campaigns` を状態（draft / sent）、RSS 公開有無、作成日時とともに表示。行をクリックで **Quick-Send** ページへ。

---

## Quick-Send ページ

パス：`/admin/newsletter/quick-send/[id]`

左側：
- **件名** / **プレビューテキスト**：編集可、「下書き保存」で永続化
- **HTML プレビュー**：iframe でライブ表示
- **PDF 出力**：プレビュー iframe に `window.print()` → PDF 保存

右側：
- **受信者リスト**：複数選択チェックボックス、各 list の購読者数を表示
- **テスト送信**：1 つの email を入力、SendGrid はそれだけに送信（sent_count/sent_at を変更しない）
- **本番送信**：二段階確認、選択した list の全メンバーに送信
- **RSS 公開**：`published_at = now()` を設定、公開 `/api/newsletter/feed.xml` に即時反映

送信は SendGrid Email API、1 API call あたり最大 1000 件（personalizations 配列、各受信者が独自の To: ヘッダ）。送信後：
- `newsletter_campaigns.status='sent'`, `sent_at`, `sent_count`, `total_recipients` 全て記録
- `contact_id` 連結済み各 subscriber には `interaction_logs` 1 行（type=`email`, `send_method='sendgrid'`, `campaign_id`）
- ⚠ SendGrid 送信は連絡先の「最終活動時刻」にカウント**されません**（連絡先ドキュメントの動作マトリクス参照）

---

## 画像アセット

ニュースレターの全画像（ロゴ、イベント写真等）は **Supabase Storage bucket `newsletter-assets`** に配置。外部 CDN は非推奨（歴史的な listmonk CDN は廃止）。

- Public bucket、URL 形式：`https://<project>.supabase.co/storage/v1/object/public/newsletter-assets/<period>/<filename>`
- ファイル名は ASCII のみ（Storage key 制限）；CJK 含む場合は hash ベースの fallback（`asset-<8-char-sha256>.ext`）
- 1 回限りの移行スクリプト：`scripts/migrate-newsletter-images.mjs`（campaign HTML 読取 → 全外部画像ダウンロード → Storage アップロード → `<img src>` 書き換え）

---

## RSS Feed（Substack 向け）

公開エンドポイント：`/api/newsletter/feed.xml`（RSS 2.0）

- `published_at IS NOT NULL` の campaigns のみ出力
- 最新 20 件、`published_at DESC` 順
- 各 item：`title`, `link`（`/newsletter/view/<slug>`）, `guid`, `pubDate`, `description`（preview_text）, `content:encoded`（完全 HTML、CDATA）

### Substack 設定
1. Substack → Settings → **Import from RSS**
2. URL：`https://crm.cancerfree.io/api/newsletter/feed.xml`
3. Substack が定期的に poll（通常数時間毎）、新 item を自動で下書き化
4. Substack にログインしてレイアウト確認、publish ボタンを押す

注：Substack には Post-by-Email API がない（確認済）ため、RSS ルート採用。

---

## 月次ワークフロー（推奨）

1. **コンテンツ準備**：月次ニュースレター執筆（将来は `newsletter_tone_samples` を使った AI 支援）
2. **Campaign 作成**：DB に直接挿入、後に `/admin/newsletter/compose` UI から skeleton 生成
3. **新画像を Storage にアップロード**（必要な場合）
4. **Quick-Send ページ**：件名 / プレビューテキスト調整、list 選択
5. **テスト送信** を自分の email に送りレイアウト確認
6. **RSS 公開** → Substack が自動下書き化 → Substack 側でレイアウト確認
7. **本番送信** 全購読者へ
8. Substack で publish

---

## `last_activity` を汚染しない保証

SendGrid 送信の interaction_logs は全て `send_method='sendgrid'` でタグ付け；`contacts.last_activity_at` の DB trigger 条件 `send_method IS DISTINCT FROM 'sendgrid'` が除外します。

つまり、ニュースレターを 4000+ 購読者に送信しても、付随する interaction_logs が全連絡先の「最終活動」を同時刻に上書きしません。この仕組みはビルトイン、追加設定不要。
