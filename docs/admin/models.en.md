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

Providers are shown as a list with these columns: Provider Name, Base URL, API Key, Models (the number of models under that provider), and Status. Click any row to expand that provider's model list below.

### Add a Provider

Click "Add Endpoint" and fill in:

| Field | Description | Example |
|-------|-------------|---------|
| Provider Name | Display name | Google Gemini |
| Base URL | API endpoint | `https://generativelanguage.googleapis.com/v1beta` |
| API Key | Provider's API Key | `AIza...` |

### Change API Key

The API Key is masked in the list; click the eye icon to reveal the plaintext. Click "Change API Key" to reveal an inline input, enter the new key, and save. (The provider name and Base URL cannot be edited.)

### Enable / Disable a Provider

Click the toggle in the Status column to enable or disable the entire provider.

### Delete a Provider

Click the 🗑 on the row and confirm to **delete the provider directly** — you do not need to delete its models first.

---

## Managing AI Models

Select a provider above first; its model list then appears below.

### Add a Model

In that provider's model area, click "Add Model":

| Field | Description | Example |
|-------|-------------|---------|
| Model ID | Model name used by the API | `gemini-2.5-flash` |
| Display Name | Name shown when users select | `Gemini 2.5 Flash` |

### Enable / Disable a Model

Click the toggle in the model row's Status column. When disabled, the model no longer appears in the personal settings dropdown; users who had selected it fall back to the default model.

### Delete a Model

Click the 🗑 on the model row and confirm to delete it.

---

## Usage Scenarios

| Operation | Model Used |
|-----------|------------|
| Bot business card OCR | User's personal model setting |
| Web business card upload recognition | User's personal model setting |
| Task natural language parsing `/work` | User's personal model setting |
| AI email generation | User's personal model setting |
