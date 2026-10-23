-- 039_ai_provider_training.sql
-- Account-scoped provider settings. API credentials are encrypted by the app.
CREATE TABLE IF NOT EXISTS public.ai_settings (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini', 'openai')),
  model text NOT NULL DEFAULT 'gemini-2.5-flash',
  custom_instructions text NOT NULL DEFAULT '',
  business_knowledge text NOT NULL DEFAULT '',
  api_key_encrypted text,
  api_key_last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_settings_select_admin ON public.ai_settings FOR SELECT USING (is_account_member(account_id, 'admin'));
CREATE POLICY ai_settings_insert_admin ON public.ai_settings FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY ai_settings_update_admin ON public.ai_settings FOR UPDATE USING (is_account_member(account_id, 'admin')) WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY ai_settings_delete_owner ON public.ai_settings FOR DELETE USING (is_account_member(account_id, 'owner'));
COMMENT ON TABLE public.ai_settings IS 'Per-account AI settings; encrypted API credentials must never be exposed to client code.';
