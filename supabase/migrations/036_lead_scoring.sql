
-- ============================================================
-- 036_lead_scoring.sql
-- Persistent 0-100 Lead Score
-- ============================================================

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS lead_score INTEGER NOT NULL DEFAULT 0;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS lead_score_band TEXT NOT NULL DEFAULT 'low';

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS lead_score_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS lead_score_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contacts_lead_score_range_check'
  ) THEN
    ALTER TABLE contacts
    ADD CONSTRAINT contacts_lead_score_range_check
    CHECK (
      lead_score >= 0
      AND lead_score <= 100
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contacts_lead_score_band_check'
  ) THEN
    ALTER TABLE contacts
    ADD CONSTRAINT contacts_lead_score_band_check
    CHECK (
      lead_score_band IN (
        'low',
        'medium',
        'high'
      )
    );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS
  idx_contacts_account_lead_score
ON contacts(account_id, lead_score DESC);

CREATE INDEX IF NOT EXISTS
  idx_contacts_lead_score_band
ON contacts(account_id, lead_score_band);
