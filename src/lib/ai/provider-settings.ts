import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/whatsapp/encryption";

export type AIProvider = "gemini" | "openai";
export type RuntimeAISettings = {
  provider: AIProvider;
  model: string;
  apiKey?: string;
  customInstructions: string;
  businessKnowledge: string;
};
type StoredAISettings = {
  provider: string;
  model: string | null;
  custom_instructions: string | null;
  business_knowledge: string | null;
  api_key_encrypted: string | null;
  api_key_last4: string | null;
};

export function isAIProvider(value: unknown): value is AIProvider {
  return value === "gemini" || value === "openai";
}

/** Public response excludes the encrypted credential and any plaintext key. */
export function toPublicAISettings(row: StoredAISettings | null) {
  const provider: AIProvider = row && isAIProvider(row.provider) ? row.provider : "gemini";
  const envKey = provider === "gemini" ? process.env.GEMINI_API_KEY : undefined;
  return {
    provider,
    model: row?.model || (provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash"),
    customInstructions: row?.custom_instructions ?? "",
    businessKnowledge: row?.business_knowledge ?? "",
    hasApiKey: Boolean(row?.api_key_encrypted || envKey),
    apiKeyLast4: row?.api_key_last4 ?? (envKey ? envKey.slice(-4) : null),
  };
}

/** Server-only account lookup; never call this from client components. */
export async function loadRuntimeAISettings(accountId: string): Promise<RuntimeAISettings | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  const supabase = createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("ai_settings")
    .select("provider,model,custom_instructions,business_knowledge,api_key_encrypted")
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    console.error("AI provider settings lookup failed", { code: error.code });
    return null;
  }
  if (!data || !isAIProvider(data.provider)) return null;

  let apiKey: string | undefined;
  if (data.api_key_encrypted) {
    try {
      apiKey = decrypt(data.api_key_encrypted);
    } catch {
      console.error("AI provider credential decryption failed", { accountId });
    }
  } else if (data.provider === "gemini") {
    apiKey = process.env.GEMINI_API_KEY;
  }

  return {
    provider: data.provider,
    model: data.model || (data.provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash"),
    apiKey,
    customInstructions: data.custom_instructions ?? "",
    businessKnowledge: data.business_knowledge ?? "",
  };
}
