# myCRM

A lightweight CRM built for `@cancerfree.io`. Snap a business card in Telegram → AI reads it → one tap to save → manage everything on the web.

> Current version: **v1.3.0**

---

## Features

- **Telegram Bot** — Send one or more card photos; AI combines them, extracts contact info, and shows a confirm button.
- **Web Dashboard** — Full-featured contact management with search, tag filters, interaction logs, and export.
- **Multi-photo OCR** — Upload up to 6 card images at once (front + back, etc.); AI merges all into one result.
- **AI OCR** — Pluggable AI backend via admin panel (Endpoint + Model two-tier). Defaults to Google Gemini.
- **Email** — Send from the contact page via Microsoft Graph. Supports templates (with attachments), AI-generated content, editable To field, and one-off temp attachments.
- **Task Management** — Create self-reminders or assign tasks to teammates; assistants can mark tasks done.
- **Countries** — Admin-managed country list (ISO 3166-1 α-2 with multilingual names and flag emoji); contacts link to a country.
- **Reports** — Generate Excel reports for contacts and interaction logs; schedule recurring email delivery via Gmail OAuth.
- **Microsoft SSO** — Only `@cancerfree.io` accounts can sign in (Azure AD → Supabase Auth).
- **Role-based Access** — `member` and `super_admin`. Admins manage users, AI endpoints/models, tags, templates, and countries.
- **i18n** — UI fully translated in 繁中 / English / 日本語; locale saved in cookie.
- **Responsive Sidebar** — Mobile hamburger drawer; tablet icon-only with hover expand; desktop full width.
- **Light / Dark Theme** — Toggle in the header; preference saved in DB.
- **Image Optimization** — All card images compressed (max 1024px, JPEG 85%) before storage.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Database & Storage | Supabase (PostgreSQL + Storage) |
| Telegram Bot | Telegraf |
| AI / OCR | Pluggable (Google Gemini by default) |
| Email | Microsoft Graph API |
| Image Processing | Sharp (server) + Canvas (browser) |
| Deployment | Vercel |

---

## Key Routes

| Path | Description |
|---|---|
| `/` | Dashboard (stats, recent activity) |
| `/contacts` | Contact list — search, tag filter, export |
| `/contacts/[id]` | Contact detail — info, cards, logs, send mail |
| `/contacts/new` | New contact — form + multi-photo OCR |
| `/contacts/batch-upload` | Batch card scan (up to 20 images) |
| `/notes` | Full-text note/log search |
| `/tasks` | Task management |
| `/settings` | Personal settings (Telegram ID, AI model, theme) |
| `/docs` | In-app user guide |
| `/admin/users` | User role management |
| `/admin/models` | AI endpoint + model management |
| `/admin/tags` | Tag management |
| `/admin/templates` | Email template management |
| `/admin/reports` | Report generation + scheduled delivery |
| `/admin/countries` | Country list management |
| `/api/bot` | Telegram webhook |

---

## Database Schema (key tables)

```sql
users (id, email, display_name, role, telegram_id, ai_model_id, provider_token, created_at)

contacts (id, created_by, name, name_en, name_local,
          company, company_en, company_local, job_title,
          email, second_email, phone, second_phone,
          address, website, linkedin_url, facebook_url,
          notes, country_code → countries.code,
          card_img_url, created_at)

contact_cards (id, contact_id, url, storage_path, label, created_at)

interaction_logs (id, contact_id, user_id, type, content,
                  email_subject, meeting_date, created_at)

tags (id, name, created_at)
contact_tags (contact_id, tag_id)

ai_endpoints (id, name, base_url, api_key_enc, is_active, created_at)
ai_models (id, endpoint_id, model_id, display_name, is_active, created_at)

email_templates (id, title, subject, body_content, created_at)
template_attachments (id, template_id, file_name, file_url, file_size, created_at)

tasks (id, title, description, due_at, created_by, status, created_at)
task_assignees (task_id, user_id)

countries (id, code, name_zh, name_en, name_ja, emoji, is_active, created_at)

report_schedules (id, name, cron_expr, range_days, recipients, is_active, created_at)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project
- Telegram Bot token from [@BotFather](https://t.me/BotFather)
- Microsoft Azure AD App Registration
- AI provider API key (Gemini or compatible)

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

Fill in `.env.local` — see `.env.local.example` for all required variables.

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

1. Bind your Telegram ID in **Personal Settings** on the web.
2. Send one or more business card photos to the bot.
3. Bot replies with extracted info and a **Save** button.
4. Use `/note` to log meeting notes, `/search` to look up contacts, `/email` to send mail.

---

## License

MIT
