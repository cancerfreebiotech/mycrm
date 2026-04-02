---
title: Telegram Bot Setup
parent: System Deployment (IT)
nav_order: 2
---

# Telegram Bot Setup Guide

## Step 1: Create the Bot

1. Search for `@BotFather` on Telegram
2. Send `/newbot`
3. Enter the Bot display name (e.g. `myCRM Bot`)
4. Enter the Bot username (must end with `bot`, e.g. `mycrm_notify_bot`)
5. Obtain the **Bot Token** (format: `123456:ABC-DEF...`)

---

## Step 2: Set Environment Variables

Enter the token into Vercel environment variables:

```
TELEGRAM_BOT_TOKEN=<your token>
```

---

## Step 3: Set the Webhook

After deployment is complete, run the following command to set the Webhook (one-time only):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://mycrm.vercel.app/api/bot"
```

Successful response:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

---

## Step 4: Link User Telegram IDs

Each user must link their own Telegram ID:

1. Log in to Web Dashboard → **Personal Settings**
2. Send any message to the Bot (e.g. `/start`); the Bot will reply with your Telegram ID
3. Enter the ID in the "Telegram ID" field in Personal Settings and save

---

## Verify Normal Operation

After linking, send `/help` to the Bot — you should receive a command list in reply.
