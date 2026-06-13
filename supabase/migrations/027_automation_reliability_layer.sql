ALTER TABLE automation_pending_executions
ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE automation_pending_executions
ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5;

ALTER TABLE automation_pending_executions
ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE automation_pending_executions
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE automation_pending_executions
ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

ALTER TABLE automation_pending_executions
ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_automation_pending_account_status
ON automation_pending_executions(account_id, status);

CREATE INDEX IF NOT EXISTS idx_automation_pending_status_run_at
ON automation_pending_executions(status, run_at);