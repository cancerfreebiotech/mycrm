# myCRM

A lightweight CRM built for `@cancerfree.io`. Snap a business card in Telegram → AI reads it → one tap to save → manage everything on the web.

> Current version: **v8.1.9**

---

## Features

- **Telegram Bot** — Send one or more card photos; AI combines them, extracts contact info, and shows a confirm button.
- **Web Dashboard** — Full-featured contact management with search, tag filters, interaction logs, and export.
- **Multi-photo OCR** — Upload up to 6 card images at once (front + back, etc.); AI merges all into one result.
- **Batch Scan & Pending Queue** — Bot batch mode (`/b`) lets you send many cards in a row; they're queued for background OCR, then you review, edit, merge, or skip each result in the pending queue before it's saved.
- **AI Feature Routing** — Three-tier AI configuration in the admin panel (Endpoint → Model → per-feature assignment). Eight AI features (assistant, social briefing, note formatting, feedback triage, AI review, newsletter refine/translate, card-OCR default) can each be assigned to a different endpoint/key/model; unassigned features fall back to the system default (`src/lib/aiRouting.ts`). Endpoints support `google` (Gemini SDK direct, with function calling + Google Search grounding) and `openai` (any `/chat/completions`-compatible service — Portkey, OpenRouter, or self-hosted Ollama/vLLM/LM Studio). Each endpoint/model/assignment has a one-tap test button with persisted last-test results (v8.0).
- **Email** — Send from the contact page via Microsoft Graph. Supports templates (with attachments), AI-generated content, editable To field, and one-off temp attachments.
- **Bulk Email (SendGrid)** — Compose and send campaigns to large recipient lists via SendGrid, with delivery / open / bounce tracking through webhooks and suppression handling. Per-contact mail still sends via Microsoft Graph.
- **Newsletter** — Build subscriber lists (from contacts or CSV import), collect material through the Bot (`/news`), reorder drafts by drag, AI-compose issues, and send or schedule campaigns; also publishes an RSS feed and handles one-click unsubscribe.
- **Task Management** — Create self-reminders or assign tasks to teammates; assistants can mark tasks done.
- **Countries** — Admin-managed country list (ISO 3166-1 α-2 with multilingual names and flag emoji); contacts link to a country.
- **Reports** — Generate Excel reports for contacts and interaction logs (incl. visit time/location); schedule recurring email delivery via Gmail OAuth.
- **Soft Delete & Trash** — Contacts are soft-deleted (deleted_at); super_admin can restore or permanently delete via `/admin/trash`.
- **Photo EXIF** — Uploading companion photos auto-extracts GPS + shooting date (exifr); reverse geocode to location name; preview shown during upload.
- **Language / Medical Fields** — Contacts have `language` (中文/英文/日文), `hospital`, and `department` fields for medical contacts.
- **Visit Records** — Interaction logs support `meeting_time` and `meeting_location`; web form has time picker + location input; Bot `/n` auto-parses via Gemini, `/v` guides step-by-step.
- **Microsoft SSO** — Only `@cancerfree.io` accounts can sign in (Azure AD → Supabase Auth).
- **MFA (TOTP)** — All users must set up two-factor authentication after first login. TOTP via any authenticator app; manage from Settings.
- **Role-based Access** — `member` and `super_admin`. Admins manage users, AI endpoints/models, tags, templates, and countries.
- **Export Permissions** — Contact export is gated by `export_contacts` in `granted_features`; admins grant per-user from `/admin/users`.
- **Feedback** — Users submit bug reports or feature requests (with optional screenshot) from the sidebar. Admins triage via `/admin/feedback`.
- **Teams Bot (Dr.Ave)** — Microsoft Teams bot for task assignment, deadline reminders, and CRM notifications. Package: `DrAve-Bot.zip`.
- **Photo Albums & Face Tagging** — Shared photo album for companion photos; tag multiple people in a single photo and link each face to a contact (v7.1).
- **AI Assistant** — In-app chat assistant that can search your CRM and answer questions about contacts and activity (v7.2). Conversations are persisted server-side (last 40 messages) so they survive reloads and device switches, with an inline "clear conversation" action (v8.1.2).
- **Social Briefing** — From a contact's page, generate an AI briefing that summarizes public context about the person or company before a meeting (v7.2). Saved briefings auto-load on the contact page (with generation time and model), so a reload shows the latest result instead of re-running (v8.1.3).
- **Org Settings** — Super admins configure organization branding (name, newsletter reply-to/logo, company links) and the allowed login email domain from `/admin/org-settings` (v7.7).
- **Audit Log** — Super admins review a chronological log of sensitive admin actions (role changes, exports, deletions) at `/admin/audit-log` (v7.7).
- **GDPR Contact Export** — Export every personal-data record tied to a single contact (cards, photos, logs, tasks, newsletter/email events) as one JSON file for data-subject requests; gated by the `export_contacts` grant and audit-logged (v7.7).
- **Newsletter A/B Testing** — Campaigns can run a small-sample test that auto-sends to the winner, or a full 50/50 split; results feed deduplicated open/click analytics (v7.8).
- **One-line Visit Logging** — Bot `/v <name> <what happened>` lets AI parse the date/location/content of a visit in a single message; the step-by-step flow remains (v7.8).
- **Actionable Task Reminders** — The daily task digest attaches "✅ Done" / "⏰ +1 day" buttons so tasks can be handled without opening the web app (v7.8).
- **Feedback Reporter Confirmation** — Feedback is closed by the original reporter: admins can mark an item "resolved, pending confirmation" (which emails the reporter in their UI language), and only the reporter confirms completion from `/feedback` (v7.9.8).
- **Multi-tenant Foundation** — All 43 business tables carry `org_id` with org-scoped API injection, RLS isolation, and per-org Storage prefixes. The system runs single-tenant today (default `cancerfree` org); the onboarding/invite flow is deferred (v7.9.0–v7.9.4).
- **Test Suite** — Vitest is wired in (`npm run test`) with unit coverage for core utils and the AI routing resolution chain (v7.9.5+).
- **Email Enrichment (Hunter.io)** — Automatically discover and verify missing contact emails; managed from the admin Health page.
- **MCP Server** — Exposes CRM data to AI agents over the Model Context Protocol; admins issue scoped access tokens and monitor usage.
- **i18n** — UI fully translated in 繁中 / English / 日本語; locale saved in cookie.
- **Responsive Sidebar** — Mobile hamburger drawer; tablet icon-only with hover expand; desktop full width.
- **Light / Dark Theme** — Toggle in the header; preference saved in DB.
- **Image Optimization** — All card images compressed (max 1024px, JPEG 85%) before storage.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Database & Storage | Supabase (PostgreSQL + Storage) |
| Telegram Bot | Telegraf |
| Teams Bot | Bot Framework (Azure) |
| AI / OCR | Pluggable per feature — Google Gemini (SDK direct) or any OpenAI-compatible endpoint; Portkey is the primary AI gateway |
| Email | Microsoft Graph (per-contact) + SendGrid (bulk / newsletter) |
| Image Processing | Sharp (server) + Canvas (browser) |
| Deployment | Vercel (functions pinned to `hnd1` / Tokyo, co-located with Supabase `ap-northeast-1`) |

---

## Key Routes

| Path | Description |
|---|---|
| `/` | Dashboard (stats, recent activity) |
| `/contacts` | Contact list — search, tag filter, export |
| `/contacts/[id]` | Contact detail — info, cards, logs, send mail |
| `/contacts/new` | New contact — form + multi-photo OCR |
| `/contacts/batch-upload` | Batch card scan (up to 20 images) |
| `/contacts/pending` | Pending-OCR review queue (batch scans awaiting confirmation) |
| `/photos` | Shared photo album with multi-person face tagging |
| `/ai-assistant` | AI chat assistant |
| `/email/compose` | Compose a bulk email |
| `/email/campaigns` | Bulk email campaign list & delivery stats |
| `/notes` | Full-text note/log search |
| `/tasks` | Task management |
| `/feedback` | Submit bug report or feature request |
| `/settings` | Personal settings (Telegram ID, theme, MFA) |
| `/mfa/setup` | First-time TOTP setup |
| `/mfa/verify` | MFA verification on login |
| `/docs` | In-app user guide |
| `/admin/users` | User role & permission management |
| `/admin/models` | AI endpoints, models, and per-feature assignment + test buttons |
| `/admin/tags` | Tag management |
| `/admin/templates` | Email template management |
| `/admin/reports` | Report generation + scheduled delivery |
| `/admin/countries` | Country list management |
| `/admin/newsletter/lists` | Newsletter subscriber lists |
| `/admin/newsletter/campaigns` | Newsletter campaigns |
| `/admin/newsletter/draft` | Newsletter drafts (Bot `/news` material) |
| `/admin/health` | System health + Hunter.io email enrichment |
| `/admin/mcp-tokens` | MCP access token management |
| `/admin/mcp-activity` | MCP usage activity |
| `/admin/trash` | Soft-deleted contacts (super_admin only) |
| `/admin/feedback` | Feedback triage (super_admin only) |
| `/admin/org-settings` | Organization branding + login-domain config (super_admin only) |
| `/admin/audit-log` | Sensitive admin-action audit trail (super_admin only) |
| `/api/bot` | Telegram webhook |
| `/api/mcp` | MCP server endpoint for AI agents |
| `/api/contacts/[id]/export` | GDPR data-subject export (JSON) for a single contact |

---

## Database Schema (key tables)

> As the multi-tenant foundation (Phase 0–2), 43 business tables (contacts,
> interaction_logs, tasks, ai_feature_models, ai_chat_sessions, etc.) carry an
> `org_id` (FK → `organizations`); global tables (users, countries, ai_endpoints,
> ai_models, …) do not. The system runs single-tenant today, so every row belongs
> to the default `cancerfree` org.

```sql
organizations (id, name, slug, plan_tier, status, settings, branding, created_at)
organization_members (org_id, user_id → users.id, role, status,
                      granted_features, created_at)
organization_invites (id, org_id, email, role, token, expires_at,
                      accepted_at, created_at)

users (id, email, display_name, role, telegram_id, ai_model_id,
       provider_token, granted_features, created_at)
-- ai_model_id: retained column, no longer read/written (personal model
-- selection removed in v8.1.0 — AI models are assigned org-wide)

contacts (id, created_by, name, name_en, name_local,
          company, company_en, company_local, job_title,
          email, second_email, phone, second_phone,
          address, website, linkedin_url, facebook_url,
          notes, country_code → countries.code,
          language, hospital, department,
          deleted_at, deleted_by,
          card_img_url, created_at)

contact_cards (id, contact_id, url, storage_path, label, created_at)

contact_photos (id, contact_id, photo_url, storage_path,
                taken_at, latitude, longitude, location_name, note, created_at)

interaction_logs (id, contact_id, user_id, type, content,
                  email_subject, meeting_date, meeting_time, meeting_location, created_at)

medical_departments (id, name, created_at)

tags (id, name, created_at)
contact_tags (contact_id, tag_id)

ai_endpoints (id, name, base_url, api_key_enc, kind, is_active,
              last_tested_at, last_test_ok, last_test_error, created_at)
-- kind: 'google' (Gemini SDK direct) | 'openai' (/chat/completions compatible)
ai_models (id, endpoint_id, model_id, display_name, is_active,
           last_tested_at, last_test_ok, last_test_error, created_at)
ai_feature_models (org_id, feature, ai_model_id → ai_models.id, updated_at)
-- per-feature model assignment; unassigned feature → system default
ai_chat_sessions (org_id, user_id, messages, updated_at)
-- Web AI assistant history (last 40 messages); service-role only

email_templates (id, title, subject, body_content, created_at)
template_attachments (id, template_id, file_name, file_url, file_size, created_at)

tasks (id, title, description, due_at, created_by, status, created_at)
task_assignees (task_id, user_id)

countries (id, code, name_zh, name_en, name_ja, emoji, is_active, created_at)

report_schedules (id, name, cron_expr, range_days, recipients, is_active, created_at)

feedback (id, created_by, type, title, description, screenshot_url, status, created_at)
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase project
- Telegram Bot token from [@BotFather](https://t.me/BotFather)
- Microsoft Azure AD App Registration
- AI provider API key (Google Gemini and/or a Portkey gateway key)
- SendGrid API key (bulk email / newsletter)

### 1. Clone & Install

```bash
git clone https://github.com/cancerfreebiotech/mycrm.git
cd mycrm
npm install
```

### 2. Environment Variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local` — see `.env.local.example` for the full list, and
[`docs/deployment/setup.md`](docs/deployment/setup.md) for per-variable notes.
Main categories:

- **Supabase** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Telegram** — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
- **AI** — `PORTKEY_API_KEY` + `PORTKEY_CONFIG_ID` (primary gateway), `GEMINI_API_KEY` (fallback / Google features)
- **Email** — `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_WEBHOOK_SECRET`
- **App & security** — `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_SECRET`, `CRON_SECRET`, `ADMIN_SECRET`, `ALLOWED_EMAIL_DOMAIN`
- **Optional** — Gmail OAuth (report delivery), Microsoft Teams / Azure OAuth, `MCP_AGENT_TOKEN`

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment

1. Push to GitHub.
2. Import project in [Vercel](https://vercel.com) and add all env vars.
3. Deploy, then register the Telegram webhook:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-domain>/api/bot"
```

---

## Bot Usage

### Telegram Bot

1. Bind your Telegram ID in **Personal Settings** on the web.
2. Send one or more business card photos to the bot — it OCRs them and replies with a **Save** button.
3. Scanning many cards? Use `/b` (batch mode), keep sending photos, then `/done` to queue them for background OCR and review the results in the pending queue.

Common commands (see [`docs/bot/commands.md`](docs/bot/commands.md) for the full list):

| Command | What it does |
|---|---|
| `/help` (`/h`) | Show all available commands |
| `/search <keyword>` (`/s`) | Look up contacts by name / email |
| `/note <name>` (`/n`) | Log an interaction note |
| `/visit <name>` (`/v`) | Add a guided visit record |
| `/a <name>` | Add a card photo to a contact (OCR); creates it if not found |
| `/p <name>` | Add a companion photo to a contact |
| `/li` | Add a contact from a LinkedIn screenshot |
| `/email` (`/e`) | Send mail from a contact |
| `/tasks` (`/t`) | List your open tasks |
| `/news` | Collect newsletter material |
| `/user` (`/u`) | List organization members |
| `/ai` | Show the AI model in effect org-wide (read-only) |
| `/lang <zh\|en\|ja>` | Change the bot's language |

### Teams Bot (Dr.Ave)

1. Upload `teams-app/DrAve-Bot.zip` to Teams Admin Center.
2. Assign the app to users or teams.
3. Supports task notifications, deadline reminders, and CRM alerts.

---

## License

MIT
