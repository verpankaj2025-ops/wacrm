
-- ============================================================
-- 032 REBOOKING ENGINE
-- Links a new appointment back to the completed/no-show visit.
-- ============================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS rebooked_from_id UUID
    REFERENCES appointments(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_rebooked_from
  ON appointments(rebooked_from_id);

CREATE INDEX IF NOT EXISTS idx_appointments_contact_rebooking
  ON appointments(account_id, contact_id, status, start_at);
