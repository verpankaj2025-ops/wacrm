-- ============================================================
-- 038_ai_sales_booking.sql
-- Idempotent appointment linkage for AI Sales Agent
-- ============================================================

-- Ensure the idempotency column is part of the migration itself.
-- This keeps 038 reproducible on a fresh database.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS ai_booking_key text;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS sales_booking_appointment_id uuid,
  ADD COLUMN IF NOT EXISTS sales_confirmation_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contacts_sales_booking_appointment
  ON public.contacts(sales_booking_appointment_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_ai_booking_key
  ON public.appointments(account_id, ai_booking_key)
  WHERE ai_booking_key IS NOT NULL;

COMMENT ON COLUMN public.contacts.sales_booking_appointment_id IS
  'Appointment created or linked by the AI Sales Agent.';

COMMENT ON COLUMN public.contacts.sales_confirmation_at IS
  'Timestamp when the customer explicitly confirmed the booking.';

COMMENT ON COLUMN public.appointments.ai_booking_key IS
  'Deterministic idempotency key for AI-created appointments.';
