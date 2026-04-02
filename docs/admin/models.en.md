---
title: AI Model Management
parent: Admin
nav_order: 3
---

# AI Model Management

Path: `/admin/models` (visible to super_admin only)

---

## Architecture Overview

AI models use a two-tier structure:

```
AI Provider (Endpoint)
  └── AI Model
        ├── gemini-2.0-flash
        └── gemini-1.5-pro
```

Users first select a provider, then select a model within that provider, in their personal settings.

---

## Managing AI Providers

### Add a Provider

| Field | Description | Example |
|-------|-------------|---------|
| Name | Display name | Google Gemini |
| Base URL | API endpoint | `https://generativelanguage.googleapis.com/v1beta` |
| API Key | Provider's API Key | `AIza...` |

### Edit / Delete

Click the ✏️ / 🗑 button in the provider list.

> Please delete all models under a provider before deleting the provider itself.

---

## Managing AI Models

### Add a Model

Click "+ Add Model" under a provider:

| Field | Description | Example |
|-------|-------------|---------|
| Model ID | Model name used by the API | `gemini-2.0-flash` |
| Display Name | Name shown when users select | `Gemini 2.0 Flash` |
| Status | Enabled / Disabled | — |

### Disabling a Model

When disabled, this model no longer appears in the personal settings dropdown. Users who have already selected this model will have the system fall back to the default model.

---

## Usage Scenarios

| Operation | Model Used |
|-----------|------------|
| Bot business card OCR | User's personal model setting |
| Web business card upload recognition | User's personal model setting |
| Task natural language parsing `/work` | User's personal model setting |
| AI email generation | User's personal model setting |
