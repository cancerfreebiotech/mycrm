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

Enter the token and two secrets into Vercel environment variables:

```
TELEGRAM_BOT_TOKEN=<your token>
TELEGRAM_WEBHOOK_SECRET=<your own random string>
ADMIN_SECRET=<your own random string>
```

- `TELEGRAM_WEBHOOK_SECRET`: the secret the Bot uses to verify every update.
- `ADMIN_SECRET`: the secret protecting the admin endpoint that registers the webhook.

Use a sufficiently long random string for each.

---

## Step 3: Set the Webhook

After deployment is complete, open the following URL in a browser to register the Webhook (one-time only):

```
https://<APP_URL>/api/admin/set-webhook?secret=<ADMIN_SECRET>
```

This endpoint registers the webhook with `TELEGRAM_WEBHOOK_SECRET` as its secret token, so the Bot only accepts updates carrying the correct secret.

> ⚠️ Do not register manually with `curl .../setWebhook?url=...`: a webhook registered that way has no secret token, so the Bot returns 403 because the `x-telegram-bot-api-secret-token` header is missing, and all messages are rejected.

Successful response (excerpt):
```json
{"setWebhook":{"ok":true,"result":true,"description":"Webhook was set"},"webhookUrl":"https://mycrm.vercel.app/api/bot"}
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
