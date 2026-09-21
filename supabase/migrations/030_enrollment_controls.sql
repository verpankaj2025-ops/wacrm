-- 030_enrollment_controls.sql

ALTER TABLE automation_enrollments
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;

ALTER TABLE automation_enrollments
  ADD COLUMN IF NOT EXISTS current_step_position INTEGER
  NOT NULL DEFAULT 0;

ALTER TABLE automation_enrollments
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

ALTER TABLE automation_enrollments
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;

ALTER TABLE automation_enrollments
  DROP CONSTRAINT IF EXISTS automation_enrollments_status_check;

ALTER TABLE automation_enrollments
  ADD CONSTRAINT automation_enrollments_status_check
  CHECK (
    status IN (
      'pending',
      'running',
      'paused',
      'completed',
      'cancelled',
      'failed'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_active_automation_enrollment
ON automation_enrollments(
  account_id,
  automation_id,
  contact_id
)
WHERE status IN (
  'pending',
  'running',
  'paused'
);

CREATE INDEX IF NOT EXISTS
  idx_automation_enrollments_next_run
ON automation_enrollments(
  account_id,
  status,
  next_run_at
);
