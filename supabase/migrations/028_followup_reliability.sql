-- 028_followup_reliability.sql

ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS
  cancel_on_customer_reply
  BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE automation_pending_executions
  ADD COLUMN IF NOT EXISTS
  cancel_on_customer_reply
  BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE automation_pending_executions
  ADD COLUMN IF NOT EXISTS
  cancelled_at TIMESTAMPTZ;

ALTER TABLE automation_pending_executions
  ADD COLUMN IF NOT EXISTS
  cancel_reason TEXT;

ALTER TABLE automation_pending_executions
  DROP CONSTRAINT IF EXISTS
  automation_pending_executions_status_check;

ALTER TABLE automation_pending_executions
  ADD CONSTRAINT
  automation_pending_executions_status_check
  CHECK (
    status IN (
      'pending',
      'running',
      'done',
      'failed',
      'cancelled'
    )
  );

CREATE INDEX IF NOT EXISTS
  idx_automation_pending_followup_contact
ON automation_pending_executions(
  account_id,
  contact_id,
  status,
  run_at
)
WHERE status = 'pending'
  AND cancel_on_customer_reply = TRUE;
