# mycrm-inbound-email Worker

Cloudflare Email Worker that receives mail to `inbox@bcc.cancerfree.io` and
forwards the raw RFC822 message to mycrm's `/api/inbound-email` endpoint.

## One-time setup

1. **Sub-zone for `bcc.cancerfree.io`** in Cloudflare:
   - Dashboard → Add Site → `bcc.cancerfree.io` (use Free plan)
   - Add the two NS records Cloudflare gives you to the parent `cancerfree.io`
     zone (parent is also in CF, just a separate zone)

2. **Email Routing** on the new sub-zone:
   - Email → Email Routing → Enable
   - CF auto-adds MX records
   - Routes → Add → Custom address → `inbox@bcc.cancerfree.io`
   - Action: **Send to a Worker** → (deploy this worker first, then pick)

3. **Deploy this Worker**:
   ```bash
   cd workers/inbound-email
   npm install
   npx wrangler login
   npx wrangler secret put INBOUND_PARSE_SECRET   # paste the same value as Vercel env
   npx wrangler deploy
   ```

4. **Vercel env**:
   - `INBOUND_PARSE_SECRET` = same secret as above
   - `ORG_EMAIL_DOMAIN` = `cancerfree.io` (default; only set if different)
   - `BCC_INBOX_DOMAIN` = `bcc.cancerfree.io` (default; only set if different)

## Verify

```bash
dig MX bcc.cancerfree.io
# expect: route1/2/3.mx.cloudflare.net
```

Send a test email from Gmail to `inbox@bcc.cancerfree.io`. Check:
- mycrm Vercel logs for `/api/inbound-email` POST
- mycrm contacts page — Gmail sender should appear as a new contact
- That contact's interaction_logs — one row with `direction='inbound'`,
  `send_method='outlook'`, `type='email'`
