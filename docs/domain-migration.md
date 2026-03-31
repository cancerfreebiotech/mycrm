# Domain Migration Guide

How to migrate the CRM from `*.vercel.app` to a custom domain (e.g. `crm.yourdomain.com`).

---

## 1. Vercel — Add Custom Domain

1. Vercel → Project → **Settings → Domains**
2. Enter `crm.yourdomain.com` → **Add**
3. Vercel provides a DNS record:
   - Type: `CNAME`
   - Name: `crm`
   - Value: `cname.vercel-dns.com`
4. Set `crm.yourdomain.com` as **Primary** — old Vercel URL will auto-redirect

---

## 2. DNS Settings

Add the following record in your DNS provider (GoDaddy / Cloudflare / Google Domains):

| Type | Name | Value |
|------|------|-------|
| CNAME | crm | cname.vercel-dns.com |

> If using Cloudflare: disable the proxy (grey cloud) until Vercel SSL verification completes, then re-enable.

DNS propagation: 5–30 minutes (up to 24 hours).

---

## 3. Vercel — Update Environment Variables

**Settings → Environment Variables**, update:

```
NEXT_PUBLIC_APP_URL = https://crm.yourdomain.com
NEXTAUTH_URL = https://crm.yourdomain.com
```

Trigger a redeploy after saving (or push an empty commit):
```bash
git commit --allow-empty -m "ci: trigger redeploy for domain change"
git push origin main
```

---

## 4. Supabase — Auth Redirect URLs

**Supabase Dashboard → Authentication → URL Configuration**

- **Site URL**: `https://crm.yourdomain.com`
- **Redirect URLs**: add `https://crm.yourdomain.com/**`

---

## 5. Telegram Webhook

The project has a built-in utility route. After Vercel redeploys, open in browser:

```
https://crm.yourdomain.com/api/admin/set-webhook?secret=YOUR_ADMIN_SECRET
```

Success response:
```json
{
  "setWebhook": { "ok": true, "result": true },
  "webhookInfo": { "url": "https://crm.yourdomain.com/api/bot" },
  "webhookUrl": "https://crm.yourdomain.com/api/bot"
}
```

---

## 6. Microsoft Teams Bot (Azure Portal)

1. [portal.azure.com](https://portal.azure.com) → Search **Azure Bot** → select your bot
2. Left menu → **Configuration**
3. **Messaging endpoint**:
   ```
   https://crm.yourdomain.com/api/teams-bot
   ```
4. Click **Apply**
5. Left menu → **Channels** → confirm Microsoft Teams is still **Enabled**

---

## 7. Google OAuth (Gmail Integration)

1. [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Click your **OAuth 2.0 Client**
3. **Authorized redirect URIs** → **+ ADD URI**:
   ```
   https://crm.yourdomain.com/api/auth/gmail/callback
   ```
4. Keep the old Vercel URL entry (do not delete)
5. **Save**

---

## 8. SendGrid Webhook

1. [app.sendgrid.com](https://app.sendgrid.com) → **Settings → Mail Settings → Event Webhooks**
2. Edit the existing webhook
3. **HTTP Post URL**:
   ```
   https://crm.yourdomain.com/api/sendgrid/webhook
   ```
4. Save and optionally click **Test Your Integration**

---

## Checklist

| Step | Service | Done |
|------|---------|------|
| 1 | Vercel domain added + DNS configured | ☐ |
| 2 | SSL verified (Valid Configuration ✅) | ☐ |
| 3 | Vercel env vars updated + redeployed | ☐ |
| 4 | Supabase Auth URLs updated | ☐ |
| 5 | Telegram Webhook re-registered | ☐ |
| 6 | Azure Teams Bot endpoint updated | ☐ |
| 7 | Google OAuth redirect URI added | ☐ |
| 8 | SendGrid Webhook URL updated | ☐ |
