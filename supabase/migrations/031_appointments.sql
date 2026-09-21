
-- ============================================================
-- 031 APPOINTMENT SYSTEM
-- Core appointment/booking records for the CRM.
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  contact_id UUID NOT NULL
    REFERENCES contacts(id)
    ON DELETE CASCADE,

  conversation_id UUID
    REFERENCES conversations(id)
    ON DELETE SET NULL,

  assigned_to UUID
    REFERENCES profiles(user_id)
    ON DELETE SET NULL,

  service_name TEXT NOT NULL,

  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,

  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (
      status IN (
        'scheduled',
        'confirmed',
        'completed',
        'cancelled',
        'no_show'
      )
    ),

  notes TEXT,

  source TEXT NOT NULL DEFAULT 'manual',

  created_by UUID NOT NULL
    REFERENCES auth.users(id)
    ON DELETE RESTRICT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT appointments_valid_time
    CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_appointments_account_start
  ON appointments(account_id, start_at);

CREATE INDEX IF NOT EXISTS idx_appointments_contact_start
  ON appointments(contact_id, start_at);

CREATE INDEX IF NOT EXISTS idx_appointments_assigned_start
  ON appointments(assigned_to, start_at);

CREATE INDEX IF NOT EXISTS idx_appointments_status_start
  ON appointments(account_id, status, start_at);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select
  ON appointments;

DROP POLICY IF EXISTS appointments_insert
  ON appointments;

DROP POLICY IF EXISTS appointments_update
  ON appointments;

DROP POLICY IF EXISTS appointments_delete
  ON appointments;

CREATE POLICY appointments_select
  ON appointments
  FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY appointments_insert
  ON appointments
  FOR INSERT
  WITH CHECK (is_account_member(account_id));

CREATE POLICY appointments_update
  ON appointments
  FOR UPDATE
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

CREATE POLICY appointments_delete
  ON appointments
  FOR DELETE
  USING (is_account_member(account_id));

DROP TRIGGER IF EXISTS set_updated_at
  ON appointments;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE appointments;
  END IF;
END $$;
