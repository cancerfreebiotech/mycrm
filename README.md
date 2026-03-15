# myCRM — Telegram Business Card Scanner CRM

A lightweight CRM system that lets you scan business cards via Telegram, extract contact info with AI, and manage everything through a web dashboard.

**Flow:** Snap a card photo in Telegram → AI reads it → One tap to save → View contacts on the web.

> Current version: **v0.6.1**

---

## Features

- **Telegram Bot** — Send a business card photo to the bot; it compresses the image, runs OCR, and shows you the extracted data with a confirm button.
- **AI OCR** — Pluggable AI backend (configurable via admin panel); defaults to Google Gemini. Extracts name, company, job title, email, and phone from card images.
- **Contact Management** — Web dashboard to search, view, edit, tag, and export contacts with full detail pages and interaction logs.
- **Microsoft SSO** — Web dashboard is protected by Microsoft (Azure AD) OAuth. Only `@cancerfree.io` accounts can sign in.
- **Role-based Access** — `member` and `super_admin` roles. Admins manage users, AI endpoints/models, and tags from the admin panel.
- **Email Templates** — Create reusable templates with AI-generation support; send directly from the web or via Bot.
- **Image Optimization** — All card images are compressed (max 1024px, JPEG 85%) before storage. Cancelled scans immediately delete the uploaded image; a daily pg_cron job cleans any orphaned files.
- **Light / Dark Theme** — Toggle in the header; preference saved per user in the database.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Database & Storage | Supabase (PostgreSQL + Storage) |
| Telegram Bot | Telegraf |
| AI / OCR | Google Gemini 1.5 Flash |
| Image Processing | Sharp |
| Deployment | Vercel |

---

## Database Schema

```sql
-- Authorized Telegram users (whitelist)
authorized_users (id, telegram_id, name, is_admin, created_at)

-- Business card contacts
contacts (id, telegram_user_id, name, company, job_title, email, phone, card_image_url, created_at)

-- Interaction history per contact
interaction_logs (id, contact_id, content, created_at)

-- Reusable email templates
email_templates (id, name, subject, body, attachment_urls, created_at)
```

---

## Project Structure

```
src/
├── app/
│   ├── api/bot/route.ts        # Telegram webhook handler
│   └── (dashboard)/
│       ├── page.tsx            # Dashboard home
│       ├── contacts/           # Contact list + detail pages
│       └── admin/
│           ├── users/          # Whitelist management
│           └── templates/      # Email templates
└── lib/
    ├── supabase.ts             # Supabase client (server + service role)
    ├── gemini.ts               # Gemini OCR integration
    └── imageProcessor.ts       # Image compression with Sharp
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A Telegram Bot token from [@BotFather](https://t.me/BotFather)
- A [Google AI Studio](https://aistudio.google.com) API key (Gemini)
- A Microsoft Azure AD App Registration (for authentication)

### 1. Clone & Install

```bash
git clone https://github.com/cancerfreebiotech/mycrm.git
cd mycrm
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Your deployment URL (for webhook registration)
NEXTAUTH_URL=https://your-domain.com
```

### 3. Set Up Microsoft Authentication

This app uses Microsoft (Azure AD) OAuth via Supabase, restricted to `@cancerfree.io` accounts only.

**Azure AD setup:**
1. Go to [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Set Redirect URI (Web): `https://<your-supabase-project>.supabase.co/auth/v1/callback`
3. Note down: **Application (client) ID** and **Directory (tenant) ID**
4. Go to **Certificates & secrets** → **New client secret** → copy the **Value**

**Supabase setup:**
1. Go to **Authentication** → **Providers** → **Azure**
2. Fill in: Client ID, Client Secret, and Tenant URL (`https://login.microsoftonline.com/<tenant-id>`)
3. Save

### 4. Set Up the Database

Run the following SQL in your Supabase SQL editor:

```sql
create table authorized_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint,
  name text,
  company text,
  job_title text,
  email text,
  phone text,
  card_image_url text,
  created_at timestamptz default now()
);

create table interaction_logs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  content text,
  created_at timestamptz default now()
);

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text,
  body text,
  attachment_urls text[],
  created_at timestamptz default now()
);
```

Also create a Supabase Storage bucket named `card-images` (public or private as needed).

### 5. Register the Telegram Webhook

After deploying (or using a tunnel like [ngrok](https://ngrok.com) locally), register the webhook:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://mycrm-vert.vercel.app/api/bot"
```

### 6. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

---

## Deployment (Vercel)

1. Push the repo to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. Add all environment variables from `.env.local` in the Vercel project settings.
4. Deploy, then register the Telegram webhook pointing to your Vercel URL.

### Live URLs

| Page | URL |
|---|---|
| Dashboard | https://mycrm-vert.vercel.app/ |
| Contacts | https://mycrm-vert.vercel.app/contacts |
| Whitelist Management | https://mycrm-vert.vercel.app/admin/users |
| Email Templates | https://mycrm-vert.vercel.app/admin/templates |
| Telegram Webhook | https://mycrm-vert.vercel.app/api/bot |

---

## Bot Usage

1. Add your Telegram ID to the `authorized_users` table (you can do this from the admin panel once you're set up, or via Supabase directly for the first admin).
2. Send a photo of a business card to the bot.
3. The bot replies with the extracted contact info and a **Save Contact** button.
4. Tap the button to save. The contact now appears in the web dashboard.

---

## License

MIT
