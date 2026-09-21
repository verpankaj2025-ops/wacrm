
ALTER TABLE broadcasts
  DROP CONSTRAINT IF EXISTS broadcasts_status_check;

ALTER TABLE broadcasts
  ADD CONSTRAINT broadcasts_status_check
  CHECK (
    status IN (
      'draft',
      'scheduled',
      'sending',
      'sent',
      'cancelled',
      'failed'
    )
  );

ALTER TABLE broadcast_recipients
  DROP CONSTRAINT IF EXISTS broadcast_recipients_status_check;

ALTER TABLE broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_status_check
  CHECK (
    status IN (
      'pending',
      'sent',
      'delivered',
      'read',
      'replied',
      'cancelled',
      'failed'
    )
  );

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_broadcasts_schedule
  ON broadcasts(account_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status
  ON broadcast_recipients(broadcast_id, status);
