CREATE OR REPLACE FUNCTION update_conversation_on_inbound(
  p_conversation_id UUID,
  p_last_message TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations
  SET
    last_message_text = p_last_message,
    last_message_at = NOW(),
    unread_count = COALESCE(unread_count, 0) + 1,
    updated_at = NOW()
  WHERE id = p_conversation_id;
END;
$$;