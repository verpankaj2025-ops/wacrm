-- ============================================================
-- 023_integrations.sql
--
-- Integration Center foundation.
--
-- One generic table for all external integrations.
--
-- Providers:
--   whatsapp
--   meta_lead_ads
--   instagram
--   messenger
--   google_business
--   website_form
--   custom_webhook
--
-- Account scoped.
-- RLS protected.
-- ============================================================

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  provider TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'disconnected',

  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  last_sync_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT integrations_provider_check
    CHECK (
      provider IN (
        'whatsapp',
        'meta_lead_ads',
        'instagram',
        'messenger',
        'google_business',
        'website_form',
        'custom_webhook'
      )
    ),

  CONSTRAINT integrations_status_check
    CHECK (
      status IN (
        'connected',
        'disconnected',
        'error'
      )
    ),

  CONSTRAINT integrations_account_provider_unique
    UNIQUE(account_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_account
ON integrations(account_id);

CREATE INDEX IF NOT EXISTS idx_integrations_provider
ON integrations(provider);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- Any account member can view integrations
CREATE POLICY integrations_select
ON integrations
FOR SELECT
USING (
  is_account_member(account_id)
);

-- Admin+ can create integrations
CREATE POLICY integrations_insert
ON integrations
FOR INSERT
WITH CHECK (
  is_account_member(account_id, 'admin')
);

-- Admin+ can update integrations
CREATE POLICY integrations_update
ON integrations
FOR UPDATE
USING (
  is_account_member(account_id, 'admin')
);

-- Owner only delete
CREATE POLICY integrations_delete
ON integrations
FOR DELETE
USING (
  is_account_member(account_id, 'owner')
);