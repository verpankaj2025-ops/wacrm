import { supabaseAdmin } from "@/lib/automations/admin-client";
import type { AIProviderName } from "./prompt.types";

export type AITrainingSettings = {
  provider: "gemini" | "openai";
  model: string;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  customInstructions: string;
  businessKnowledge: string;
};

type TrainingRow = {
  provider: string;
  model: string | null;
  custom_instructions: string | null;
  api_key_last4: string | null;
  api_key_encrypted: string | null;
};

const defaultModel = (provider: "gemini" | "openai") => provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash";

export function publicTrainingSettings(row: TrainingRow | null, businessKnowledge: string): AITrainingSettings {
  const provider: "gemini" | "openai" = row?.provider === "openai" ? "openai" : "gemini";
  const envKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  return {
    provider, model: row?.model || defaultModel(provider),
    hasApiKey: Boolean(row?.api_key_encrypted || envKey),
    apiKeyLast4: row?.api_key_last4 ?? (envKey ? envKey.slice(-4) : null),
    customInstructions: row?.custom_instructions ?? "",
    businessKnowledge,
  };
}

export async function getTrainingSettings(accountId: string) {
  const db = supabaseAdmin();
  const [{ data: row, error: settingsError }, { data: knowledge, error: knowledgeError }] = await Promise.all([
    db.from("ai_training_settings").select("provider,model,custom_instructions,api_key_last4,api_key_encrypted").eq("account_id", accountId).maybeSingle(),
    db.from("ai_knowledge").select("title,content,enabled,priority").eq("account_id", accountId).eq("enabled", true).order("priority", { ascending: false }).limit(100),
  ]);
  if (settingsError && settingsError.code !== "PGRST116") throw settingsError;
  if (knowledgeError) throw knowledgeError;
  const businessKnowledge = (knowledge ?? []).map((item) => `## ${item.title}\n${item.content}`).join("\n\n");
  return publicTrainingSettings(row ?? null, businessKnowledge);
}

export async function getRuntimeTrainingSettings(accountId: string) {
  const db = supabaseAdmin();
  const [{ data: row, error: settingsError }, { data: knowledge, error: knowledgeError }] = await Promise.all([
    db.from("ai_training_settings").select("provider,model,custom_instructions,api_key_encrypted").eq("account_id", accountId).maybeSingle(),
    db.from("ai_knowledge").select("title,content").eq("account_id", accountId).eq("enabled", true).order("priority", { ascending: false }).limit(100),
  ]);
  if (settingsError || !row || knowledgeError) return null;
  return {
    provider: row.provider === "openai" ? "openai" as const : "gemini" as const,
    model: row.model || defaultModel(row.provider === "openai" ? "openai" : "gemini"),
    apiKeyEncrypted: row.api_key_encrypted as string | null,
    customInstructions: row.custom_instructions ?? "",
    businessKnowledge: (knowledge ?? []).map((item) => `## ${item.title}\n${item.content}`).join("\n\n"),
  };
}

export function isSupportedProvider(provider: unknown): provider is "gemini" | "openai" {
  return provider === "gemini" || provider === "openai";
}
