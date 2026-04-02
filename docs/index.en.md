---
title: Home
nav_order: 1
---

# myCRM Documentation

myCRM is the internal Contact Relationship Management system for CancerFree Biotech. Its core feature is **Telegram Bot → photograph business card → AI recognition → automatically saved to the database**, paired with a Web management interface for contact maintenance, task assignment, report export, and more.

---

## System Features

| Feature | Description |
|---------|-------------|
| 📷 Business Card Scanning | Upload via Telegram Bot or web; up to 6 images merged for AI recognition with side-by-side confirmation |
| 👥 Contact Management | Full contact database with country field, Email copy, Tag classification, batch upload, and Excel export |
| ✅ Task Management | Create tasks via Bot natural language; Web interface with three tabs; assignable to assistants |
| 📝 Interaction Logs | Notes, meeting records, Email records linked to contacts |
| 📧 Enhanced Email | Editable recipients, template support (with attachments), AI-generated content, temporary attachments |
| 📊 Reports | One-click Excel download or scheduled Gmail delivery |
| 🌍 Country Management | Admin maintains multilingual country list (with flag emojis) linked to contacts |
| 🌐 Multilingual | Traditional Chinese / English / Japanese |
| 🌓 Dark Mode | Light / Dark theme toggle |
| 📱 Mobile | Hamburger side menu; collapses to icon-only on tablet |

---

## System Architecture

```
Telegram Bot ──→ Webhook (Next.js API Route)
                      │
                      ├──→ Gemini AI (OCR + Task Parsing)
                      │
                      └──→ Supabase (PostgreSQL + Storage)
                                │
                          Web Dashboard (Next.js)
                                │
                          Microsoft Teams Bot
```

---

## Version Information

Current version: **v1.3.0** (2026-03-17)

> For detailed version history, see [CHANGELOG](CHANGELOG.md)

---

## Quick Navigation

- **General users**: Start with [First Login](getting-started/first-login.md)
- **Bot users**: See [Command List](bot/commands.md)
- **Administrators**: See [Admin Area](admin/users.md)
- **IT / Deployment**: See [System Deployment](deployment/setup.md)
