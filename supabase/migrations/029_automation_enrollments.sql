-- 029_automation_enrollments.sql

CREATE TABLE IF NOT EXISTS automation_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'running',
        'completed',
        'cancelled',
        'failed'
      )
    ),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
  idx_automation_enrollments_account
ON automation_enrollments(
  account_id,
  status,
  created_at
);

CREATE INDEX IF NOT EXISTS
  idx_automation_enrollments_contact
ON automation_enrollments(
  account_id,
  contact_id,
  status
);

CREATE INDEX IF NOT EXISTS
  idx_automation_enrollments_automation
ON automation_enrollments(
  account_id,
  automation_id,
  status
);

ALTER TABLE automation_enrollments
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
  "Users can view own automation enrollments"
ON automation_enrollments;

CREATE POLICY
  "Users can view own automation enrollments"
ON automation_enrollments
FOR SELECT
USING (
  account_id IN (
    SELECT p.account_id
    FROM profiles p
    WHERE p.user_id = auth.uid()
  )
);
