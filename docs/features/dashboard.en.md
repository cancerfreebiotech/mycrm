---
title: Dashboard
parent: Features
nav_order: 1
---

# Dashboard

Path: `/` (default page after login)

---

## Statistics Cards

The top of the dashboard shows three real-time statistics:

| Card | Description |
|------|-------------|
| **Total Contacts** | Total number of contacts in the system |
| **Added This Month** | Number of contacts added this month (from the 1st) |
| **Unassigned Notes** | Number of interaction records not yet linked to a contact (click to go to the management page) |

---

## Tag Distribution Chart

A bar chart showing the number of contacts under each Tag, sorted from most to fewest.

> This section only appears after Tags have been created.

---

## Country Distribution

A bar chart showing the number of contacts per country, sorted from most to fewest, displaying up to the top 10:

- Each row shows the flag emoji, country name, and contact count
- Countries beyond the top 10 are grouped into "Other countries"
- Contacts with no country are grouped under "Unknown"
- Click any row to jump to the contact list with that country filter applied

> This section only appears once contacts have a country filled in.

---

## Email Send Status

Summarizes the current deliverability status of all email recipients, in two parts.

### CRM Contacts

Cards show the number of CRM contacts in each email status. Click any card to jump to the contact list with that status filter applied:

| Status | Description |
|--------|-------------|
| Can email | Currently deliverable |
| Bounced | Permanently bounced |
| Invalid email | Invalid address |
| Unsubscribed | Recipient has unsubscribed |
| Temporary failure | Temporary send failure; may recover later |
| Mailbox full | Recipient's mailbox is full |
| Sender issue | Send problem on our (sender) side |
| Recipient blocked | Blocked by the recipient's server |

### External Subscribers (no CRM link)

Shows the total number of external newsletter subscribers not in CRM contacts. Click to open subscriber list management.

---

## Pending Unassigned Notes

Lists the 5 most recent unassigned notes (interaction records where `contact_id` is null). Each entry shows:
- Record type (Note / Meeting / Email / System)
- Creator's name
- Creation time
- **Assign Contact** button → opens a search popup to assign the note immediately

Click "View All" to go to the full [Unassigned Notes page](notes.md).
