-- ============================================================
-- 024_lead_management_foundation.sql
--
-- Stage 6.5 foundation:
-- lead source
-- lead status
-- assignment
--
-- Future ready for:
-- Meta Lead Ads
-- Instagram
-- Messenger
-- Website Forms
-- Google Business
-- Custom Webhooks
-- WhatsApp
-- ============================================================

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT 'whatsapp';

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new';

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS assigned_to UUID NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_lead_source
ON contacts(lead_source);

CREATE INDEX IF NOT EXISTS idx_contacts_lead_status
ON contacts(lead_status);

CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to
ON contacts(assigned_to);