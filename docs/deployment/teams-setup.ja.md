---
title: Teams Bot 設定
parent: システムデプロイ（IT）
nav_order: 3
---

# Teams Bot 設定ガイド

## 前提条件

- Microsoft Azure AD の管理者権限
- Vercel にデプロイされた myCRM の URL

---

## ステップ 1：Azure で Bot を作成

1. [Azure Portal](https://portal.azure.com) にアクセスします
2. 「Azure Bot」を検索 → 作成
3. 以下を入力します：
   - **Bot handle**（一意の名前、例：`mycrm-bot`）
   - **Subscription / Resource Group**：既存のものを選択
   - **Pricing tier**：F0（無料）
   - **Microsoft App ID**：「Create new Microsoft App ID」を選択
4. 作成完了後、Bot リソース → **Configuration** に移動します
5. **Microsoft App ID** をメモします
6. 「Manage Password」をクリック → 新しい Secret を作成 → **Client Secret** をメモします

---

## ステップ 2：Messaging Endpoint の設定

Azure Bot → **Configuration** に以下を入力します：

```
Messaging endpoint: https://mycrm.vercel.app/api/teams-bot
```

---

## ステップ 3：Teams チャンネルの有効化

1. Azure Bot → **Channels** → **Microsoft Teams** をクリック
2. 利用規約に同意 → **Apply**

---

## ステップ 4：環境変数の設定

Vercel に以下の環境変数を入力します：

| 変数 | 説明 | 取得場所 |
|------|------|---------|
| `TEAMS_BOT_APP_ID` | Microsoft App ID | Azure Bot → Configuration |
| `TEAMS_BOT_APP_SECRET` | Client Secret | Azure AD → App Registrations → Certificates & secrets |
| `TEAMS_TENANT_ID` | テナント ID | Azure AD → Overview |

---

## ステップ 5：Teams アプリのパッケージング

`teams-app/` フォルダには以下がすでに含まれています：
- `manifest.json`（Bot App ID が入力済み）
- `color.png`（192×192）
- `outline.png`（32×32）

`manifest.json` の `botId` が Azure Bot App ID と一致することを確認してから、zip にパッケージングします：

**Windows PowerShell：**
```powershell
Compress-Archive -Path teams-app\manifest.json, teams-app\color.png, teams-app\outline.png -DestinationPath teams-app\myCRM-Bot.zip -Force
```

**macOS / Linux：**
```bash
cd teams-app && zip myCRM-Bot.zip manifest.json color.png outline.png
```

---

## ステップ 6：Teams へのアップロード（全社展開）

1. [Microsoft Teams 管理センター](https://admin.teams.microsoft.com) にアクセスします
2. **Teams アプリ** → **アプリを管理** → **新しいアプリをアップロード**
3. `myCRM-Bot.zip` をアップロードします
4. 承認後、**セットアップ ポリシー** → **グローバル（組織全体の既定値）** に移動します
5. **インストール済みアプリ**に myCRM Bot を追加 → 保存

---

## ステップ 7：Teams で Bot を見つける

方法 1：Teams 左サイドバーの **...（その他のインストール済みアプリ）** から「myCRM」を検索
方法 2：Teams 上部の検索バーに `@myCRM Bot` と入力

見つかったら「開く」または「チャット」をクリックして通知の受信を開始します。
