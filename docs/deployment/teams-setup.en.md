---
title: Teams Bot Setup
parent: System Deployment (IT)
nav_order: 3
---

# Teams Bot Setup Guide

## Prerequisites

- Microsoft Azure AD administrator permissions
- myCRM URL deployed on Vercel

---

## Step 1: Create the Bot on Azure

1. Go to [Azure Portal](https://portal.azure.com)
2. Search "Azure Bot" → Create
3. Fill in:
   - **Bot handle** (unique name, e.g. `mycrm-bot`)
   - **Subscription / Resource Group**: select an existing one
   - **Pricing tier**: F0 (free)
   - **Microsoft App ID**: select "Create new Microsoft App ID"
4. After creation, go to the Bot resource → **Configuration**
5. Note down the **Microsoft App ID**
6. Click "Manage Password" → Create a new Secret → note down the **Client Secret**

---

## Step 2: Set the Messaging Endpoint

In Azure Bot → **Configuration**, enter:

```
Messaging endpoint: https://mycrm.vercel.app/api/teams-bot
```

---

## Step 3: Enable the Teams Channel

1. Azure Bot → **Channels** → Click **Microsoft Teams**
2. Accept the terms of service → **Apply**

---

## Step 4: Set Environment Variables

Enter the following environment variables in Vercel:

| Variable | Description | Where to Find |
|----------|-------------|---------------|
| `TEAMS_BOT_APP_ID` | Microsoft App ID | Azure Bot → Configuration |
| `TEAMS_BOT_APP_SECRET` | Client Secret | Azure AD → App Registrations → Certificates & secrets |
| `TEAMS_TENANT_ID` | Tenant ID | Azure AD → Overview |

---

## Step 5: Package the Teams App

The `teams-app/` folder already contains:
- `manifest.json` (with Bot App ID filled in)
- `color.png` (192×192)
- `outline.png` (32×32)

After confirming that `botId` in `manifest.json` matches the Azure Bot App ID, package as a zip:

**Windows PowerShell:**
```powershell
Compress-Archive -Path teams-app\manifest.json, teams-app\color.png, teams-app\outline.png -DestinationPath teams-app\myCRM-Bot.zip -Force
```

**macOS / Linux:**
```bash
cd teams-app && zip myCRM-Bot.zip manifest.json color.png outline.png
```

---

## Step 6: Upload to Teams (Company-wide Deployment)

1. Go to [Microsoft Teams Admin Center](https://admin.teams.microsoft.com)
2. **Teams apps** → **Manage apps** → **Upload new app**
3. Upload `myCRM-Bot.zip`
4. After review approval, go to **Setup policies** → **Global (Org-wide default)**
5. Add myCRM Bot under **Installed apps** → Save

---

## Step 7: Find the Bot in Teams

Method 1: Search for "myCRM" under **... (More apps)** in the Teams left sidebar
Method 2: Type `@myCRM Bot` in the Teams top search bar

Once found, click "Open" or "Chat" to start receiving notifications.
