
-- ============================================================
-- 035_customer_memory.sql
-- Persistent Customer Memory
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  contact_id UUID NOT NULL
    REFERENCES contacts(id)
    ON DELETE CASCADE,

  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,

  value_type TEXT NOT NULL DEFAULT 'text'
    CHECK (
      value_type IN (
        'text',
        'number',
        'boolean',
        'date',
        'time'
      )
    ),

  source TEXT NOT NULL DEFAULT 'system'
    CHECK (
      source IN (
        'customer',
        'agent',
        'system',
        'import'
      )
    ),

  confidence NUMERIC(4,3) NOT NULL DEFAULT 1.000
    CHECK (
      confidence >= 0
      AND confidence <= 1
    ),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(account_id, contact_id, memory_key)
);

CREATE INDEX IF NOT EXISTS
  idx_customer_memories_account_contact
ON customer_memories(account_id, contact_id);

CREATE INDEX IF NOT EXISTS
  idx_customer_memories_last_seen
ON customer_memories(account_id, contact_id, last_seen_at DESC);

ALTER TABLE customer_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
  customer_memories_select
ON customer_memories;

DROP POLICY IF EXISTS
  customer_memories_insert
ON customer_memories;

DROP POLICY IF EXISTS
  customer_memories_update
ON customer_memories;

DROP POLICY IF EXISTS
  customer_memories_delete
ON customer_memories;

CREATE POLICY customer_memories_select
ON customer_memories
FOR SELECT
USING (
  is_account_member(account_id)
);

CREATE POLICY customer_memories_insert
ON customer_memories
FOR INSERT
WITH CHECK (
  is_account_member(account_id, 'agent')
);

CREATE POLICY customer_memories_update
ON customer_memories
FOR UPDATE
USING (
  is_account_member(account_id, 'agent')
)
WITH CHECK (
  is_account_member(account_id, 'agent')
);

CREATE POLICY customer_memories_delete
ON customer_memories
FOR DELETE
USING (
  is_account_member(account_id, 'agent')
);

CREATE OR REPLACE FUNCTION
  set_customer_memory_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_seen_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  customer_memories_updated_at
ON customer_memories;

CREATE TRIGGER
  customer_memories_updated_at
BEFORE UPDATE ON customer_memories
FOR EACH ROW
EXECUTE FUNCTION set_customer_memory_updated_at();
