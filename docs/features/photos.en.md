---
title: Photo Gallery
parent: Features
nav_order: 9
---

# Photo Gallery

Path: `/photos`

The gallery is **photo-first**: it shows the group photos taken with your contacts. A single photo can be tagged with multiple contacts, and it automatically appears on the detail page of every tagged contact.

---

## The Gallery Page

All photos are shown in a grid. Each photo includes:

- **People badge**: a 👥 count in the bottom-right showing how many people are tagged (only shown when there are tags)
- **Contact names**: the tagged contacts are listed below the photo; with more than 2 people it shows "A, B +N"; if nothing is tagged it shows "Unassigned"
- **Date taken**: shown when the photo carries EXIF capture info

### Search & Sort

The search box at the top matches by **note, location, or contact name**.

| Sort | Description |
|------|-------------|
| **Upload time** | Default; by when the photo was added to the gallery |
| **Date taken** | By the photo's EXIF capture date |
| **Contact name** | By the name of the first tagged contact |

---

## How Photos Get Into the Gallery

### Telegram Bot (`/p`)

Use the `/p` command to first pick the contact the photo belongs to:

```
/p                    Attach to the last contact you worked with
/p John Doe           Pick a contact (offers to create one if not found)
/p John Doe | Acme    Pick a contact and include a company (comma also works)
```

After the bot replies, send the photo(s) directly to the bot:

1. You can send **multiple photos in a row**, then tap "Done"
2. Photos are compressed automatically and keep their EXIF (date taken, location)
3. When sending a single photo you may also add a text note

### Web Upload

On a contact's detail page, in the "Group Photo" section, click "Add Group Photo" to upload one or more photos. EXIF date and location are read automatically.

---

## Tagging People in a Photo

Click any photo to open the **lightbox**. The "People in photo" panel on the right is where tagging happens. A single photo can be tagged with multiple contacts.

| Action | Steps |
|--------|-------|
| **Add tag** | Click "Add tag" → type to search contacts → click one to tag |
| **Go to contact** | Click a tagged name to open that contact's detail page |
| **Remove tag** | Click the ✕ next to a name |

> A contact can only be tagged once per photo; a duplicate shows "This person is already tagged in this photo."

### AI Suggestions

If the system detects a likely match, it appears under "AI suggestions" in the panel, where you can ✓ **accept** or ✕ **reject** it. Accepting turns it into a confirmed tag.

### Lightbox Viewing

- Zoom with the scroll wheel or toolbar buttons; drag to pan when zoomed in; double-click to reset
- The side panel shows date taken, location, note, and upload date
- Press `ESC` or click the background to close

---

## How Photos Appear on Each Contact

Every **confirmed** tagged contact shows this photo in the "Group Photo" section of their detail page. Because a photo can belong to several people, **the same group photo appears on every participant's page**. The note can be edited by clicking the text under the photo on the contact page.

---

## Deleting vs. Removing

"Remove tag" and "Delete photo" are two different things:

| Action | Where | Effect |
|--------|-------|--------|
| **Remove tag** | The ✕ in the lightbox "People in photo" panel | Only unlinks that contact from the photo; the photo itself and everyone else's tags stay |
| **Delete photo** | The trash button in the contact's "Group Photo" section | Permanently deletes the whole photo (including the Storage file); all tags are removed with it |

> Removing a person in the gallery does **not** delete the shared photo. To actually delete a photo, delete it from the contact's detail page.
