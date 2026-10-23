-- 034_ai_training_settings.sql
-- Account-scoped provider credentials and editable AI training.
CREATE TABLE IF NOT EXISTS public.ai_training_settings (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini','openai')),
  model text NOT NULL DEFAULT 'gemini-2.5-flash',
  custom_instructions text NOT NULL DEFAULT '',
  api_key_encrypted text,
  api_key_last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_training_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_training_settings_select_admin ON public.ai_training_settings FOR SELECT USING (is_account_member(account_id,'admin'));
CREATE POLICY ai_training_settings_insert_admin ON public.ai_training_settings FOR INSERT WITH CHECK (is_account_member(account_id,'admin'));
CREATE POLICY ai_training_settings_update_admin ON public.ai_training_settings FOR UPDATE USING (is_account_member(account_id,'admin')) WITH CHECK (is_account_member(account_id,'admin'));
CREATE POLICY ai_training_settings_delete_owner ON public.ai_training_settings FOR DELETE USING (is_account_member(account_id,'owner'));

-- This branch already reads ai_knowledge in its context builder. Define it if absent.
CREATE TABLE IF NOT EXISTS public.ai_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_knowledge_select_account ON public.ai_knowledge FOR SELECT USING (is_account_member(account_id));
CREATE POLICY ai_knowledge_insert_admin ON public.ai_knowledge FOR INSERT WITH CHECK (is_account_member(account_id,'admin'));
CREATE POLICY ai_knowledge_update_admin ON public.ai_knowledge FOR UPDATE USING (is_account_member(account_id,'admin')) WITH CHECK (is_account_member(account_id,'admin'));
CREATE POLICY ai_knowledge_delete_admin ON public.ai_knowledge FOR DELETE USING (is_account_member(account_id,'admin'));
