This chapter covers myCRM's administrative features. Most pages live under the sidebar **Admin** area and their paths start with `/admin/`. A few features can be delegated to regular members; the rest are Super Admin only.

## Permissions & access model

Admin access has two tiers:

- **Super Admin** — full access to every admin feature, plus responsibility for roles, delegation, module switches, and system operations.
- **Member** — sees no admin items by default. A Super Admin can delegate individual features to specific members in **User Management**; anything not delegated stays hidden from that member's sidebar.

**Features that can be delegated to members**: tags, unassigned notes, email templates, prompts, countries, newsletter, failed-scan review, duplicate contacts, CamCard import, trash, export contacts, bulk email, and User Management (a delegated member can only reset MFA and edit the Telegram ID).

**Open to all members**: Reports (each member manages their own schedules; a Super Admin sees everyone's).

**Super Admin only**: AI Models, System Health, MCP Tokens, MCP Activity, Email Recovery, Shared Emails, Feedback, Suppressions & Send Eligibility, Data Subject Requests (DSAR), Organization Settings, Newsletter Overview, and the Audit Log.

> The front-end PermissionGate only hides entry points. Every `/api/admin/*` route re-verifies permission on the server (401 if not signed in, 403 if not authorized).

## User Management

Path: `/admin/users`. Access: Super Admin, or a member delegated **User Management** (who can only reset MFA and edit the Telegram ID).

**What it is**: Manage every member account that has signed in, plus roles, feature delegation, and account status. Sortable columns: Name, Email, Telegram, Teams binding, Role, Last login, MFA status. Mobile view uses cards.

**How to use it**:

- **Roles** (Super Admin only): toggle "Promote to Super Admin" / "Demote to member". You cannot change your own role, and the system always keeps at least one Super Admin.
- **Deactivate / offboard** (Super Admin only): "Deactivate" disables the account (double confirmation); "Reactivate" restores it. Deactivation takes effect **immediately** — the person's next action logs them out and redirects to the login page, without waiting for the session to expire.
- **Feature delegation** (Super Admin only, shown for members): each member has a row of permission chips; click to grant or revoke, granted ones show a ✓.
- **Reset MFA**: members who have set up an authenticator show a "Reset" button; after confirmation it deletes all their MFA factors and forces re-enrollment on next sign-in.
- **Edit Telegram ID**: inline-edit the Telegram column; must be a positive integer, fewer than 9 digits triggers a warning, clearing it unbinds.
- **Maintenance mode** (Super Admin only): a toggle at the top of the page; when on, regular users are sent to a maintenance page and only Super Admins can keep working.

> The Super Admin (`pohan.chen@cancerfree.io`) cannot be deactivated or demoted. Accounts are created automatically on first login; only `@cancerfree.io` Microsoft accounts can sign in.

## Organization Settings & branding

Path: `/admin/org-settings` (Super Admin only).

**What it is**: Adjust company-wide organization info, newsletter branding, and email parameters without editing code or redeploying. Settings are cached for **60 seconds**, so changes take effect within a minute of saving; a blank field falls back to the system default.

**Configurable fields**: organization name, allowed login email domains (the backend login-domain check source, comma-separated), newsletter logo URL, newsletter reply-to email, company website / Facebook / LinkedIn (footer social links), and the system-report notification recipient.

Since **v7.9.4**, these 7 email/system parameters are also set here (previously hard-coded): sender display name, internal email domain, organization email domain, BCC archive domain, physical mailing address (newsletter footer, for CAN-SPAM), organization owner email (recipient for alerts and system mail), and application URL (the public URL used in email links).

**Module switches**: disable an entire feature module in one click, also effective within 60 seconds:

- **Hunter.io auto-enrichment**: when off, new contacts are no longer auto-enriched with company/title, and running enrichment on the System Health page shows a "module disabled" notice.
- **AI Assistant**: when off, the AI assistant on both the web app and Telegram `/ai` is paused.

> Every change is written to the Audit Log (action: organization settings changed).

## Tag Management

Path: `/admin/tags`. Access: Super Admin, or a member delegated **Tags**.

**What it is**: Manage the tags used to classify contacts. The list shows tag name, contacts in use, and creation date.

**How to use it**:

- **Add**: type a name and click "Add"; names must be unique.
- **Rename**: click ✏️ to inline-edit, save with Enter or ✓.
- **Email blacklist**: click the shield icon to toggle. Contacts on a blacklisted tag are automatically **excluded from sending and from newsletter list building**, and the tag shows a red "Blacklist" marker.
- **Delete**: click 🗑 with confirmation; deleting also removes every contact's link to that tag.

## Country Management

Path: `/admin/countries`. Access: Super Admin, or a member delegated **Country Management**.

**What it is**: Maintain the list of countries selectable on contacts. Columns: ISO code, flag emoji, zh/en/ja names, status; sortable by code or name.

**How to use it**:

- **Add**: click "Add Country". The code is a two-letter ISO 3166-1 code (auto-uppercased); typing a common code (TW, JP, US, etc.) **auto-fills** the tri-lingual names and flag. Chinese and English names are required.
- **Edit**: click the pencil to change name and flag; the code is fixed once created.
- **Enable / disable**: click the status badge; disabled countries drop out of menus but their data is kept.
- **Delete**: click the trash icon with inline confirmation.

## AI Prompts

Path: `/admin/prompts`. Access: Super Admin, or a member delegated **Prompts**.

**What it is**: Set **organization-level** system-prompt overrides for each AI feature; leave blank to use the built-in default. Configurable: business-card recognition, task parsing, email generation (marked "user-editable"), document generation, meeting parsing.

**How to use it**: type a custom prompt into the relevant box and Save; **saving with the box empty** removes the override and reverts to the default. When a feature uses the default, the built-in prompt is shown below for reference.

## AI Models & endpoints

Path: `/admin/models` (Super Admin only).

**What it is**: AI models use a two-tier structure — an **AI provider (Endpoint)** holds one or more **AI models**. In personal settings a user first picks a provider, then a model.

**Managing providers**:

- **Add Endpoint**: fill in provider name, **type**, Base URL, and API Key (optional, see below).
- **Type** (v8.0.0): `Google (Gemini)` is the official Gemini API, which supports function calling for the AI Assistant and Google Search grounding for Social Briefing; `OpenAI-compatible` covers any service that exposes `/chat/completions` — Portkey, OpenRouter, or a **self-hosted** Ollama / vLLM / LM Studio instance. The type can be switched directly from the dropdown in the endpoint list.
- **API Key is optional** (v8.0.0): leave it blank for self-hosted or keyless endpoints. **Self-hosting note**: the Base URL must be publicly reachable from the deployment environment (Vercel) — an internal IP won't work, so use something like Cloudflare Tunnel or Tailscale Funnel; the Test button verifies the whole tunnel end to end.
- **Change API Key / rename**: the key is masked by default and can be toggled to plaintext; the provider name can be edited inline via the pencil ✏️ icon (v8.0.1); the Base URL is fixed once created.
- **Enable / disable / delete**: use the status toggle; a provider can be deleted directly, without first removing its models.

**Managing models**: select a provider first to reveal its model list.

- **Add Model**: fill in Model ID (the API name, e.g. `gemini-2.5-flash`) and a display name.
- **Disable**: the model drops out of the personal-settings dropdown; users who had selected it fall back to the default model.
- **Delete**: click 🗑 with confirmation.

**Test button** (v8.0.0): both endpoint and model rows have a "Test" button. Pressing it fires one minimal AI call from the server; the result shows right next to the button (a green ✅ with the latency on success, a red ❌ with the reason on failure), and the "last tested" time and result are saved and still shown after a refresh. If an endpoint has no active models, the test falls back to a plain connectivity check (any HTTP response counts as a pass).

### Feature assignment

At the bottom of the page, each of 8 AI features can be assigned to a specific model; unassigned means "system default" (the environment's built-in model — the same behavior as before v8.0.0).

**The 8 features**: AI Assistant (web + Telegram `/ai`; Google endpoints only), Social Briefing (Google endpoints only), interaction-log formatting, daily feedback triage, AI review (duplicate suggestions + merge review + note matching), newsletter polishing, newsletter translation, and the business-card-recognition default (the organization default for card recognition / bot command parsing / AI email generation — the fallback when a user hasn't picked a model in `/settings`; resolution order: personal choice → this org default → system default).

Because the AI Assistant and Social Briefing need Google-specific capabilities, their dropdowns only list models from Google-type endpoints. Every row also has a Test button — if assigned, it tests that model and records the result; if unassigned, it tests the system-default path and only displays the result without recording it. Assignment changes take effect **immediately** (up to about a 1-minute delay).

## Email Templates

Path: `/admin/templates`. Access: Super Admin, or a member delegated **Email Templates**.

**What it is**: Manage reusable email templates (subject, body, attachments). The list shows name, subject, creation date, and attachment count; expanding a row previews the body (HTML sanitized via DOMPurify).

**How to use it**: click "Add Template" or the pencil to open the editor —

- Name (required) and subject.
- Body uses a WYSIWYG (TipTap) editor.
- **AI generate**: enter a description and AI writes the body into the editor (existing body used as a reference).
- **Attachments**: upload files (5MB per file). Editing an existing template saves the upload immediately; a new template writes attachments when the template is saved. Attachments can be attached to and downloaded from outgoing mail.

Delete a template via the trash icon with inline confirmation; deleting an attachment also removes it from Storage.

## Report Management

Path: `/admin/reports`. Access: **every member** can open the page, generate reports, and manage their own schedules; a Super Admin additionally sees a "Creator" column and everyone's schedules.

**What it is / how to use it**:

- **Generate now**: pick a date range → apply filters (tag, interaction type, creator, country) → "Generate" for a table preview, or "Download Excel".
- **Recurring schedules**: "Add Schedule" sets a name, frequency (weekly / monthly / custom Cron), the number of days to cover, and recipients (comma-separated). Each can be enabled/disabled, edited, or deleted; "Last run" shows the most recent send time and result.
- **Delivery**: handled by backend automation — the system checks hourly and auto-sends due schedules. No manual trigger and no linked external mail account required.

## Trash

Path: `/admin/trash`. **Effectively Super Admin only** (besides the PermissionGate, the page has an extra super_admin check).

**What it is**: Deleted contacts move to Trash first and can be restored or permanently deleted. Columns: checkbox, name, company, deleted by, deleted at; a top banner shows the current count.

**How to use it**:

- **Restore**: move back to the live list (confirmation).
- **Permanent delete**: remove a single contact for good (confirmation; irreversible).
- **Delete selected / Empty all**: batch or clear the whole bin.
- Click a name to open a detail modal with full fields, tags, card images, and the latest 10 interactions; you can restore or permanently delete from within. Card images live in a private bucket and are shown via short-lived signed links.

## Duplicate Contact Review

Path: `/admin/duplicates`. Access: Super Admin, or a member delegated **Duplicate Contacts**.

**What it is**: Find suspected duplicate contact pairs and merge or ignore them one by one. "Scan" re-detects pairs. Pairs are split into **Exact email match** (red dot) and **Similar name** (yellow dot, with a similarity percentage).

**How to use it**: each pair shows two cards side by side —

- **Keep left / Keep right**: opens a merge confirmation with the kept side as primary (green = kept, red = will be deleted; the kept side's fields win, the other's related data is merged in, and the merge is irreversible).
- **Not a duplicate**: ignores the pair; it won't appear again.
- **AI judgment** (v7.6.0): asks AI whether they are the same person and returns a verdict (same / different / unsure), a confidence score, and reasoning; on "same" you can "Apply AI merge suggestion". AI is advisory — you still confirm.
- **Batch processing**: queue actions into a batch, see counts at the top, and "Run" to process in order (ignores first, then merges one by one).

## CamCard Import Review

Path: `/admin/camcard`. Access: Super Admin, or a member delegated **CamCard Import**.

**What it is**: Batch-imported business cards land in a review queue after recognition and only become real contacts after human confirmation. The list is grouped by **company**, 20 per page.

**Filters**: search (auto-query), country, reviewer (or unassigned), has duplicate, has email, sort (newest / oldest).

**Reviewing each card**: each card shows front/back thumbnails and recognized fields, with four actions —

- **Add**: create a new contact with the current importance/language/tags. If the card is an exact-email duplicate, this button is locked — use Merge or Skip instead.
- **Edit**: adjust recognized fields and save.
- **Merge**: fold into an existing contact (searchable; auto-preselected when a duplicate is detected; "fill blanks only" or "overwrite" modes).
- **Skip**: pass without creating.

Each card can set **importance** (H/M/L), **language** (zh/EN/ja), and **tags**, written on add or batch confirm.

**Batch operations**: add whole group (one-click confirm of the group's non-duplicate cards), checkbox batch confirm (with a progress bar), assign reviewer (enter a reviewer tag), and batch exchange date. "Add" can set a **backdate** (default `2000-01-01`) so a large import of old cards doesn't crowd the "recently added" view.

## Failed-Scan Review

Path: `/admin/failed-scans`. Access: Super Admin, or a member delegated **Failed-Scan Review**.

**What it is**: Cards photographed via the bot where AI couldn't extract a name land here so they aren't lost. By default only unreviewed items show; check "Show reviewed" to see handled records.

**How to use it**: view the card image (private bucket, signed link) → click "→ Create contact" to jump to the new-contact page carrying the image and source → return here and click "Mark done" to leave the queue. The two steps are independent — you still mark done after creating the contact. Marking done records the reviewer email and time.

## Shared-Email Contacts

Path: `/admin/shared-emails`. Access: Super Admin, or a member delegated **Bulk Email**.

**What it is**: Find where two or more contacts share the same email (spouses, family, shared inboxes) so you don't mail the same inbox twice before a blast. Top stats show shared groups and contacts involved; filter live by email/name/company.

**Contents**: one row per shared email, showing the address, how many use it, and those contacts (linkable to their contact page). Read-only — to merge people, use Duplicate Contact Review.

## Suppressions & Send Eligibility

Path: `/admin/suppressions` (Super Admin only).

**What it is**: Answer "**can we email this address, and why**" and survey the system-wide suppression lists. The verdict is a **strict union** — suppression by any single source means not sendable. Two views: **single-email lookup** (a verdict card + a per-source status table) and the **default view** (per-source counts + the most recent 50 suppression records). This page is **read-only** — you don't add or lift suppressions here.

### The five suppression sources

| Source | Condition |
|--------|-----------|
| Contact opt-out | `contacts.email_opt_out = true` (respected by the CRM direct-send path) |
| Contact email status | `contacts.email_status` is non-empty (the send worker suppresses on any non-empty value: bounced / invalid / unsubscribed / recipient_blocked / spam_report) |
| Blacklist | present in `newsletter_blacklist` (usually from SendGrid hard bounces / invalid emails / blocks) |
| Global unsubscribe | present in `newsletter_unsubscribes` (includes SendGrid unsubscribes and spam reports) |
| Subscriber unsubscribe | `newsletter_subscribers.unsubscribed_at` is non-empty |

The first two match a contact's `email` or secondary email and count only non-deleted contacts; the last three match the email exactly (case-insensitive).

### Relation to the daily SendGrid suppression import

Most of these sources are backfilled daily by the scheduled job `POST/GET /api/sendgrid/import-suppressions` (cron `0 19 * * *`, roughly 03:00 Taipei the next day). It pages through SendGrid's last-90-days hard bounces / invalid emails / unsubscribes / blocks / spam reports and writes them to `contacts.email_status`; non-CRM addresses also go to the blacklist, unsubscribes/spam reports also go to global unsubscribes, and matched contacts get a system interaction log. A Super Admin can also trigger it manually from the newsletter lists page. In short: **this page is only a viewer** — the daily cron is what feeds the data in.

## Email Recovery

Path: `/admin/email-recovery`. Access: Super Admin, or a member delegated **Duplicate Contacts**.

**What it is**: For contacts whose email has bounced/gone invalid, find the newer card the same person left after changing jobs (with a new email) and swap the old contact's email in one click. Top stats show total bounced/invalid contacts and how many "have a candidate new email"; toggle between "has candidate" and "all".

**How to use it**: each entry flags the broken email, its status, and the bounce reason in an alert color; a found candidate is listed in green with the person's name, company, and new email.

- Click "Replace with this email" to bring the candidate's email into the old contact (optionally merging in the candidate), or type one under "Manual entry" and replace.
- Replacing prompts a confirmation (it changes contact data); finished items dim and show "Replaced". Candidates are matched by name/company, so confirm they really are the same person first.

## Data Subject Requests (DSAR)

Path: `/admin/dsar` (Super Admin only).

**What it is**: Enter an email to find every related contact in the system and list each one's **personal-data footprint** (interaction logs, cards, newsletter recipients), used to answer a GDPR data subject's access / export / deletion request.

- Matches contacts by `email` or secondary email with an **exact, case-insensitive** compare.
- **Includes deleted (trashed) contacts**, marked "Deleted" — a data subject request must cover all records.
- Also shows the address's **send-eligibility verdict** (same logic as Suppressions & Send Eligibility).

**How to use it**: enter a full email → "Search". A send-eligibility card appears on top and all matching contacts with their footprint below. Each row can **View** (opens `/contacts/{id}`) or **Export** the personal-data JSON.

**Personal-data export**: calls `/api/contacts/{id}/export` and returns a single JSON (`contact-{id}-export.json`) consolidating the contact record, cards, photos, interactions, tasks, newsletter recipients, and email events; image bytes stay in Storage, so the export holds only URLs/paths.

> For accountability, **every lookup is written to the Audit Log** (action: DSAR lookup) with the queried email as the target; exports are logged too (action: GDPR data export). The page is read-only — it doesn't delete or edit anything.

## System Health

Path: `/admin/health` (Super Admin only).

**What it is**: A one-page overview of system status. The top offers "Check now" or a "Refresh every 30s" checkbox for continuous monitoring. Each block fetches from its own API, so one block failing shows an error only in that block and can be retried alone.

- **External services**: Supabase, Gemini, Portkey (AI gateway), Telegram Bot, SendGrid, Teams Bot; a status badge (OK / error / not configured) plus a latency bar (green <500ms, yellow <2000ms, red slower).
- **Hunter.io (email finder)**: paste and save an API key; stats show total without email / not yet searched / searched-no-result / searched this month, plus remaining credits; "Start search" looks up emails for not-yet-searched contacts, "Reset search status" clears the flag (confirmation). If "Hunter.io auto-enrichment" is off in Organization Settings, it shows a "module disabled" notice and spends no credits.
- **Cron heartbeat** (v7.4.0): the latest run of each background schedule (cron) — OK / overdue / error / no record, with last completion time and duration.
- **Dead letters** (v7.4.0): count of failed items per table; `pending_contacts` and `contact_briefings` offer "Re-queue", and `failed_scans` links to Failed-Scan Review.
- **This month's usage & budget thresholds** (v7.4.0; threshold editing v7.9.5): AI calls, AI input/output tokens, emails sent, newsletters sent, compared to last month. Each card takes a "monthly limit" — blank = no limit; once set, it shows a progress bar and percent (green <80%, yellow 80–99%, red ≥100%), and at 80%/100% the system auto-notifies the organization owner.

## Audit Log

Path: `/admin/audit-log` (Super Admin only; added in v7.4.0).

**What it is**: View the audit trail of sensitive/privileged operations. Data comes from the `admin_actions` table, 20 per page, with paging, filtering, and CSV export. Columns: time (Taipei timezone), actor email, action (translated to a readable label), target, and details (expand for JSON).

**Filter & export**: filter live by actor (email keyword), action (a dropdown covering all 19 privileged actions), and start/end date (by **Taipei-timezone** day boundaries). "Export CSV" exports the current filter (up to 5000 rows, with a UTF-8 BOM so Excel opens CJK correctly).

**The 19 privileged actions** (all have readable labels since v7.9.5, one-to-one with the backend write points): reset MFA, set Telegram ID, toggle maintenance mode, permanently delete contact, bulk permanent delete, create MCP token, revoke MCP token, apply email recovery, change Hunter settings, set webhook, send update notification, merge contacts, DSAR lookup, set account status, send newsletter, GDPR data export, set role, set feature permissions, and change organization settings. The page is read-only, and the backend API also verifies permission.

## MCP Tokens & Activity

Paths: `/admin/mcp-tokens`, `/admin/mcp-activity` (both Super Admin only).

**MCP Tokens**: manage the access keys external AI agents use (via MCP) to reach the system. The list shows name/purpose, assignee, scopes, last used, expiry, and status.

- **Issue a token**: fill in name/description, assignee (the agent's actions are recorded as this user), scopes (read: contacts/newsletter/tags; write: contacts/notes/newsletter — a scope beyond the assignee's own grants raises a warning), allow-any-actor (optional), and validity (permanent / 1 year / 30 days / 24 hours). The **plaintext key is shown only once** on issue — copy it immediately.
- **Manage**: each row can jump to activity, disable/enable, or delete (all confirmed); disabled or expired tokens can't be used.

**MCP Activity**: view the operations agents ran, for auditing. Loads the latest 100 by default; top stats show total / success / fail. Filter by tool and status (success / fail); columns include time, tool, status, token, actor, and IP hash, with "Expand" for the call parameters (JSON) and error message. Arriving from a token's activity link pre-filters by that `token_id`.

## Feedback Management

Path: `/admin/feedback` (Super Admin only).

**What it is**: Review and triage user-submitted suggestions and bug reports, and update their status. A total count sits next to the title; items are ordered newest-first.

**Contents & actions**: each card shows a type badge (Bug = red / Feature = purple), title, submitter, date, and a status badge (pending / in progress / resolved awaiting confirmation / done / won't fix). Expand a card for the full description and any screenshot (private bucket, signed link). Click a status button below the expanded card to switch status; it saves instantly and shows an error if the save fails.

**Reporter confirmation**: "Done" cannot be set from the admin side. Setting a report to "Resolved, awaiting confirmation" automatically emails the reporter in their interface language; the status becomes "Done" only after the reporter verifies the fix and presses "Confirm done" on `/feedback`.

## Automation & Alerts (schedules)

The system runs several background jobs via Vercel Cron. They self-authenticate (CRON_SECRET / API token) independently of login, and their status is visible in the System Health cron heartbeat. The ones most relevant to administration:

| Job | Frequency (UTC) | Purpose |
|-----|-----------------|---------|
| health-watchdog | every 10 min | patrols service health and schedule overruns; alerts admins on Telegram when something breaks and again when it recovers, without re-spamming the same issue |
| check-feedback | daily 18:00 | daily feedback digest: lists new reports with an initial AI assessment to admins, or sends "no new issues today" when there are none |
| purge-retention | daily 19:30 | retention cleanup (see below) |
| import-suppressions | daily 19:00 | backfills SendGrid suppression lists (see Suppressions & Send Eligibility) |
| hunter/cron | daily 18:00 | Hunter.io auto-enrichment for contacts without an email (gated by the "Hunter.io auto-enrichment" switch in Organization Settings) |
| run-report-schedules | hourly | auto-sends due report schedules |
| process-scheduled-campaigns | every 10 min | processes scheduled newsletter campaigns |
| task-reminders / pre-meeting-briefings / stale-contacts | daily / every 6h / weekly Mon | task reminders, pre-meeting briefings, stale-contact reminders |

**Health watchdog**: proactively alerts when a service or schedule breaks and notifies again on recovery, without hammering the same issue repeatedly. Usage-threshold alerts (80% / 100%) also ride this monitor and notify the organization owner.

**Retention cleanup**: prunes expired/soft-deleted data daily so tables don't grow forever — trashed contacts (soft-deleted over 90 days) are permanently deleted, plus bot sessions (over 30 days), Telegram dedup records (over 7 days), agent tokens expired over 30 days, newsletter draft cache (over 1 day), and cron heartbeat records (over 30 days).

**Hunter enrichment & switch**: Hunter.io fills in emails for contacts that have none; it can run daily on a schedule or be triggered manually on the System Health page. The whole module can be turned off in one click from Organization Settings (when off, neither the schedule nor a manual search spends credits).
