import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { encrypt } from "@/lib/whatsapp/encryption";
import { getTrainingSettings, isSupportedProvider } from "@/lib/ai/services/training.service";

const MAX_TEXT = 10000;
export async function GET() {
  try {
    const ctx = await requireRole("admin");
    const limit = checkRateLimit(`ai-training:read:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);
    return NextResponse.json({ settings: await getTrainingSettings(ctx.accountId) });
  } catch (error) { return toErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const limit = checkRateLimit(`ai-training:write:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    if (!isSupportedProvider(body.provider)) return NextResponse.json({ error: "Unsupported AI provider." }, { status: 400 });
    if (typeof body.model !== "string" || !body.model.trim() || body.model.length > 120) return NextResponse.json({ error: "Model is invalid." }, { status: 400 });
    if (typeof body.customInstructions !== "string" || body.customInstructions.length > MAX_TEXT) return NextResponse.json({ error: "Custom instructions are too long." }, { status: 400 });
    if (typeof body.businessKnowledge !== "string" || body.businessKnowledge.length > MAX_TEXT) return NextResponse.json({ error: "Business knowledge is too long." }, { status: 400 });
    if (body.apiKey !== undefined && (typeof body.apiKey !== "string" || body.apiKey.length > 500)) return NextResponse.json({ error: "API key is invalid." }, { status: 400 });
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const db = supabaseAdmin();
    const { data: current, error: readError } = await db.from("ai_training_settings")
      .select("provider,api_key_encrypted,api_key_last4").eq("account_id", ctx.accountId).maybeSingle();
    if (readError && readError.code !== "PGRST116") return NextResponse.json({ error: "Could not load AI settings." }, { status: 500 });
    const switching = !!current && current.provider !== body.provider;
    const keyCipher = apiKey ? encrypt(apiKey) : switching ? null : current?.api_key_encrypted ?? null;
    const keyLast4 = apiKey ? apiKey.slice(-4) : switching ? null : current?.api_key_last4 ?? null;
    const { error: saveError } = await db.from("ai_training_settings").upsert({
      account_id: ctx.accountId, provider: body.provider, model: body.model.trim(),
      custom_instructions: body.customInstructions.trim(), api_key_encrypted: keyCipher,
      api_key_last4: keyLast4, updated_at: new Date().toISOString(),
    }, { onConflict: "account_id" });
    if (saveError) {
      console.error("[AI Training] settings save failed", { code: saveError.code });
      return NextResponse.json({ error: "Could not save AI settings." }, { status: 500 });
    }

    const chunks = body.businessKnowledge.trim()
      ? body.businessKnowledge.trim().split(/\n\s*\n/).slice(0, 100)
      : [];
    const entries = chunks.map((content: string, index: number) => ({
      account_id: ctx.accountId, title: (content.split("\n")[0].replace(/^#+\s*/, "").trim() || `Knowledge ${index + 1}`).slice(0, 120),
      content: content.trim(), enabled: true, priority: chunks.length - index,
    }));
    const { error: delError } = await db.from("ai_knowledge").delete().eq("account_id", ctx.accountId);
    if (delError) {
      console.error("[AI Training] knowledge delete failed", { code: delError.code });
      return NextResponse.json({ error: "Settings saved, but business knowledge could not be replaced." }, { status: 500 });
    }
    if (entries.length) {
      const { error: insertError } = await db.from("ai_knowledge").insert(entries);
      if (insertError) {
        console.error("[AI Training] knowledge insert failed", { code: insertError.code });
        return NextResponse.json({ error: "Settings saved, but business knowledge could not be saved." }, { status: 500 });
      }
    }
    return NextResponse.json({ settings: await getTrainingSettings(ctx.accountId) });
  } catch (error) { return toErrorResponse(error); }
}
