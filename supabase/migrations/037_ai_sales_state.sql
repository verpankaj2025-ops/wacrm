-- ============================================================
-- 037_ai_sales_state.sql
-- Persistent AI Sales Agent state
--
-- The sales agent must remember where the customer is in the
-- booking journey without relying on the LLM to reconstruct it
-- from free-form conversation every time.
-- ============================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS sales_stage text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS sales_service text,
  ADD COLUMN IF NOT EXISTS sales_date date,
  ADD COLUMN IF NOT EXISTS sales_time time,
  ADD COLUMN IF NOT EXISTS sales_last_question text,
  ADD COLUMN IF NOT EXISTS sales_booking_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sales_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_sales_stage_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_sales_stage_check
  CHECK (
    sales_stage IN (
      'service',
      'date',
      'time',
      'name',
      'confirmation',
      'booked',
      'handoff'
    )
  );

CREATE INDEX IF NOT EXISTS idx_contacts_sales_stage
  ON public.contacts(account_id, sales_stage);

CREATE INDEX IF NOT EXISTS idx_contacts_sales_date_time
  ON public.contacts(account_id, sales_date, sales_time);

COMMENT ON COLUMN public.contacts.sales_stage IS
  'Persistent AI sales journey stage.';

COMMENT ON COLUMN public.contacts.sales_service IS
  'Structured service selected during AI sales conversation.';

COMMENT ON COLUMN public.contacts.sales_date IS
  'Structured requested appointment date.';

COMMENT ON COLUMN public.contacts.sales_time IS
  'Structured requested appointment time.';

COMMENT ON COLUMN public.contacts.sales_last_question IS
  'Last booking question asked by the sales agent.';

COMMENT ON COLUMN public.contacts.sales_booking_confirmed IS
  'True only after the customer explicitly confirms the booking request.';

COMMENT ON COLUMN public.contacts.sales_updated_at IS
  'Last time the sales state changed.';
