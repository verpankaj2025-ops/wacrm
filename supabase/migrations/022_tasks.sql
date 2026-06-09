CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL,
  created_by UUID NOT NULL,

  contact_id UUID NULL,
  conversation_id UUID NULL,

  title TEXT NOT NULL,
  description TEXT,

  priority TEXT NOT NULL DEFAULT 'medium',

  status TEXT NOT NULL DEFAULT 'pending',

  due_at TIMESTAMPTZ,

  assigned_to UUID,

  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_account
ON tasks(account_id);

CREATE INDEX idx_tasks_assigned
ON tasks(assigned_to);

CREATE INDEX idx_tasks_status
ON tasks(status);