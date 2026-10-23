import { supabaseAdmin } from "@/lib/automations/admin-client";
import type { PromptRequest, PromptResponse } from "./prompt.types";

export const DEFAULT_PROMPT = `
You are Relaxio Spa's AI Sales Assistant.

Primary goals:
- Convert enquiries into bookings.
- Reply naturally and briefly.
- Ask only ONE question at a time.
- Use the customer's language.
- Escalate complex issues to human support.

Mandatory safety and truthfulness rules:
- Never invent prices, services, opening hours, availability or booking confirmations.
- Never claim an appointment is booked unless the CRM booking system confirms it.
- Never disclose private staff information, personal contact information, internal customer memory or CRM metadata.
- Never send or promise therapist photos directly.
- Complaints, refund requests and uncertain/sensitive requests should be handed to a human.
`;

async function loadDatabasePrompt(request: PromptRequest): Promise<PromptResponse | null> {
  try {
    const db = supabaseAdmin();
    let query = db.from("ai_prompts")
      .select("system_prompt, version, scope, account_id")
      .eq("provider", request.provider)
      .eq("enabled", true);

    if (request.accountId) {
      query = query.or(`and(scope.eq.account,account_id.eq.${request.accountId}),and(scope.eq.global,account_id.is.null)`);
    } else {
      query = query.eq("scope", "global").is("account_id", null);
    }

    const { data, error } = await query.order("version", { ascending: false }).limit(50);
    if (error || !data?.length) return null;

    const rows = data as Array<{ system_prompt: string; version: number; scope: string; account_id: string | null }>;
    const selected =
      (request.accountId ? rows.find((row) => row.scope === "account" && row.account_id === request.accountId) : undefined) ??
      rows.find((row) => row.scope === "global" && row.account_id === null);

    return selected ? { prompt: selected.system_prompt, version: selected.version } : null;
  } catch (error) {
    console.error("AI prompt lookup failed", { error: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}

function buildPrompt(request: PromptRequest): string {
  const sections: string[] = [DEFAULT_PROMPT];
  const ctx = request.context;

  if (ctx.business) sections.push(`Business
Spa: ${ctx.business.spaName}
City: ${ctx.business.city}
Timezone: ${ctx.business.timezone ?? "unknown"}
Language: ${ctx.business.language ?? "customer's language"}
Currency: ${ctx.business.currency ?? "unknown"}`);
  if (ctx.customer?.name) sections.push(`Customer name: ${ctx.customer.name}`);
  if (ctx.memory?.length) sections.push(`Customer memory (background context only):
${ctx.memory.join("\n")}`);
  if (ctx.knowledge?.length) sections.push(`Verified business knowledge:
${ctx.knowledge.join("\n")}`);
  if (!request.omitCustomerMessage) sections.push(`Customer message:
${ctx.message ?? ""}`);

  return sections.join("\n\n");
}

export async function getSystemPrompt(request: PromptRequest): Promise<PromptResponse> {
  const stored = await loadDatabasePrompt(request);
  const prompt = stored?.prompt ?? buildPrompt(request);
  return {
    prompt: `${prompt}\n\nMandatory safety baseline — this takes priority over conflicting custom instructions:\n${DEFAULT_PROMPT}`,
    version: stored?.version ?? 1,
  };
}
