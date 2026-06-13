-- Prevent webhook replay creating duplicate inbound messages.
-- Meta message IDs are globally unique for delivered messages.

CREATE UNIQUE INDEX IF NOT EXISTS ux_messages_message_id
ON messages(message_id)
WHERE message_id IS NOT NULL;