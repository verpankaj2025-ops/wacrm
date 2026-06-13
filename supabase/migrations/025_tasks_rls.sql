ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_select
ON tasks
FOR SELECT
USING (
  is_account_member(account_id)
);

CREATE POLICY tasks_insert
ON tasks
FOR INSERT
WITH CHECK (
  is_account_member(account_id, 'agent')
);

CREATE POLICY tasks_update
ON tasks
FOR UPDATE
USING (
  is_account_member(account_id, 'agent')
);

CREATE POLICY tasks_delete
ON tasks
FOR DELETE
USING (
  is_account_member(account_id, 'agent')
);