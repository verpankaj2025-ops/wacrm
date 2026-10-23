import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { encrypt } from "@/lib/whatsapp/encryption";
import { isAIProvider, toPublicAISettings } from "@/lib/ai/provider-settings";

const MAX_TEXT_LENGTH = 10000;
const MAX_API_KEY_LENGTH = 500;

export async function GET() {
  try {
    const ctx = await requireRole("admin");
    const { data, error } = await ctx.supabase
      .from("ai_settings")
      .select("provider,model,custom_instructions,business_knowledge,api_key_encrypted,api_key_last4")
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ settings: toPublicAISettings(data ?? null) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = (await request.json()) as Record<string, unknown>;
    const { data: current, error: readError } = await ctx.supabase
      .from("ai_settings")
      .select("provider,model,custom_instructions,business_knowledge,api_key_encrypted,api_key_last4")
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (readError) throw readError;

    const provider = body.provider === undefined ? (current?.provider ?? "gemini") : body.provider;
    if (!isAIProvider(provider)) {
      return NextResponse.json({ error: "provider must be gemini or openai" }, { status: 400 });
    }
    const model = body.model === undefined ? (current?.model ?? (provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash")) : body.model;
    const customInstructions = body.customInstructions === undefined ? (current?.custom_instructions ?? "") : body.customInstructions;
    const businessKnowledge = body.businessKnowledge === undefined ? (current?.business_knowledge ?? "") : body.businessKnowledge;
    const apiKey = body.apiKey === undefined ? "" : body.apiKey;

    if (typeof model !== "string" || !model.trim() || model.length > 120) {
      return NextResponse.json({ error: "model must be 1–120 characters" }, { status: 400 });
    }
    if (typeof customInstructions !== "string" || customInstructions.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: "customInstructions must be at most 10,000 characters" }, { status: 400 });
    }
    if (typeof businessKnowledge !== "string" || businessKnowledge.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: "businessKnowledge must be at most 10,000 characters" }, { status: 400 });
    }
    if (typeof apiKey !== "string" || apiKey.length > MAX_API_KEY_LENGTH) {
      return NextResponse.json({ error: "apiKey is invalid or too long" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      account_id: ctx.accountId,
      provider,
      model: model.trim(),
      custom_instructions: customInstructions,
      business_knowledge: businessKnowledge,
      api_key_encrypted:
        current?.provider && current.provider !== provider
          ? null
          : current?.api_key_encrypted ?? null,
      api_key_last4:
        current?.provider && current.provider !== provider
          ? null
          : current?.api_key_last4 ?? null,
      updated_at: new Date().toISOString(),
    };
    // A credential belongs to one provider. Never reuse a Gemini key as an OpenAI key (or vice versa).
    if (apiKey.trim()) {
      patch.api_key_encrypted = encrypt(apiKey.trim());
      patch.api_key_last4 = apiKey.trim().slice(-4);
    }

    const { data, error } = await ctx.supabase
      .from("ai_settings")
      .upsert(patch, { onConflict: "account_id" })
      .select("provider,model,custom_instructions,business_knowledge,api_key_encrypted,api_key_last4")
      .single();
    if (error) throw error;
    return NextResponse.json({ settings: toPublicAISettings(data) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
