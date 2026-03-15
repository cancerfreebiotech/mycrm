---
title: Teams Bot 設定
parent: Bot 使用說明
nav_order: 5
---

# Teams Bot 設定教學

## 前置需求

- Microsoft Azure AD 管理員權限
- Vercel 部署的 myCRM 網址

---

## 步驟 1：在 Azure 建立 Bot

1. 前往 [Azure Portal](https://portal.azure.com)
2. 搜尋「Azure Bot」→ 建立
3. 填寫：
   - **Bot handle**（唯一名稱，例如 `mycrm-bot`）
   - **Subscription / Resource Group**：選擇現有的
   - **Pricing tier**：F0（免費）
   - **Microsoft App ID**：選「Create new Microsoft App ID」
4. 建立完成後，進入 Bot 資源 → **Configuration**
5. 記錄 **Microsoft App ID**
6. 點擊「Manage Password」→ 建立新 Secret → 記錄 **Client Secret**

---

## 步驟 2：設定 Messaging Endpoint

在 Azure Bot → **Configuration** 中，填入：

```
Messaging endpoint: https://mycrm.vercel.app/api/teams-bot
```

---

## 步驟 3：開啟 Teams Channel

1. Azure Bot → **Channels** → 點擊 **Microsoft Teams**
2. 同意服務條款 → **Apply**

---

## 步驟 4：設定環境變數

在 Vercel 填入以下環境變數：

| 變數 | 說明 | 取得位置 |
|------|------|----------|
| `TEAMS_BOT_APP_ID` | Microsoft App ID | Azure Bot → Configuration |
| `TEAMS_BOT_APP_SECRET` | Client Secret | Azure AD → App Registrations → Certificates & secrets |
| `TEAMS_TENANT_ID` | 租用戶 ID | Azure AD → Overview |

---

## 步驟 5：打包 Teams App

在 `teams-app/` 資料夾中已備有：
- `manifest.json`（已填入 Bot App ID）
- `color.png`（192×192）
- `outline.png`（32×32）

確認 `manifest.json` 中的 `botId` 與 Azure Bot App ID 一致後，打包為 zip：

**Windows PowerShell：**
```powershell
Compress-Archive -Path teams-app\manifest.json, teams-app\color.png, teams-app\outline.png -DestinationPath teams-app\myCRM-Bot.zip -Force
```

**macOS / Linux：**
```bash
cd teams-app && zip myCRM-Bot.zip manifest.json color.png outline.png
```

---

## 步驟 6：上傳至 Teams（全公司部署）

**方法：透過 Teams 管理中心（推薦，全公司可用）**

1. 前往 [Microsoft Teams 管理中心](https://admin.teams.microsoft.com)
2. **Teams apps** → **Manage apps** → **Upload new app**
3. 上傳 `myCRM-Bot.zip`
4. 審核通過後，前往 **Setup policies** → **Global (Org-wide default)**
5. 在 **Installed apps** 新增 myCRM Bot → 儲存

全公司成員即可在 Teams 中找到並使用 Bot。

---

## 步驟 7：在 Teams 找到 Bot

方法一：在 Teams 左側 **...（更多已安裝的應用程式）** 中搜尋 "myCRM"
方法二：在 Teams 頂部搜尋欄輸入 `@myCRM Bot`

找到後，點擊「開啟」或「聊天」即可開始接收通知。

---

## 使用者綁定（可選）

若要讓 Bot 能識別你的身份（以便從 Teams 操作任務），系統管理員可以在 `users` 資料表記錄 `teams_user_id`（Azure AD Object ID）。目前此步驟透過 DB 管理，後續版本將提供 UI。
