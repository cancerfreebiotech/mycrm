-- Applied to production 2026-05-19 (project gaxjgcztzfxokesiraai)
--
-- Force every new contact to have at least one name field populated.
-- Mirrors the client-side validation in src/app/(dashboard)/contacts/new/page.tsx
-- and guards bot / camcard intake paths against creating nameless ghost rows.
--
-- NOT VALID is intentional: 3 pre-existing rows (all camcard-imported) have
-- no name in any language but do have email/phone/company; we keep them as
-- the admin can rename them later via /contacts/[id]. The constraint applies
-- to all INSERTs and UPDATEs going forward.

ALTER TABLE contacts
  ADD CONSTRAINT contacts_has_name
  CHECK (coalesce(name, name_en, name_local) IS NOT NULL)
  NOT VALID;
