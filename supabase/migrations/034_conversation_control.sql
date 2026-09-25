
-- ============================================================
-- 034_conversation_control.sql
-- Conversation Control Engine
--
-- control_mode:
--   ai     = AI / Flow automation may handle inbound messages
--   human  = human takeover; AI / Flow auto-response suppressed
--   paused = temporarily paused; AI / Flow auto-response suppressed
--
-- Existing `status` remains the lifecycle state:
--   open | pending | closed
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS control_mode TEXT
    NOT NULL DEFAULT 'ai'
    CHECK (control_mode IN ('ai', 'human', 'paused'));

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS control_locked_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS control_locked_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS closed_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_control_mode
  ON conversations(account_id, control_mode);

CREATE INDEX IF NOT EXISTS idx_conversations_control_lock
  ON conversations(account_id, control_locked_by)
  WHERE control_locked_by IS NOT NULL;
