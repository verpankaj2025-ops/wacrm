import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import type { AIProviderName } from "@/lib/ai/services/prompt.types";

const PROVIDERS: AIProviderName[] = ["gemini", "openai", "claude", "deepseek", "grok"];
const MAX_PROMPT_LENGTH = 20000;

function validProvider(value: unknown): value is AIProviderName {
  return typeof value === "string" && PROVIDERS.includes(value as AIProviderName);
}

export async function GET() {
  try {
    const ctx = await requireRole("admin");
    const limit = checkRateLimit(`ai-prompts:read:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const db = supabaseAdmin();
    const { data, error } = await db.from("ai_prompts")
      .select("id,account_id,provider,scope,intent,name,system_prompt,version,enabled,updated_at")
      .or(`account_id.eq.${ctx.accountId},and(scope.eq.global,account_id.is.null)`)
      .order("provider").order("version", { ascending: false });
    if (error) {
      console.error("[Prompt API] list failed", { code: error.code });
      return NextResponse.json({ success: false, message: "Unable to load prompts." }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const limit = checkRateLimit(`ai-prompts:write:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ success: false, message: "Invalid JSON." }, { status: 400 });
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120 ||
        !validProvider(body.provider) || typeof body.systemPrompt !== "string" ||
        !body.systemPrompt.trim() || body.systemPrompt.length > MAX_PROMPT_LENGTH ||
        (body.intent !== undefined && body.intent !== null && (typeof body.intent !== "string" || body.intent.length > 100))) {
      return NextResponse.json({ success: false, message: "Invalid prompt fields." }, { status: 400 });
    }
    const db = supabaseAdmin();
    const { data: latest, error: readError } = await db.from("ai_prompts")
      .select("version").eq("account_id", ctx.accountId)
      .eq("provider", body.provider).eq("scope", "account").eq("name", body.name.trim())
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (readError) return NextResponse.json({ success: false, message: "Could not check existing prompt." }, { status: 500 });

    const { data, error } = await db.from("ai_prompts").insert({
      account_id: ctx.accountId, provider: body.provider, scope: "account",
      intent: body.intent ?? null, name: body.name.trim(),
      system_prompt: body.systemPrompt.trim(), version: (latest?.version ?? 0) + 1,
      enabled: body.enabled !== false,
    }).select("id,account_id,provider,scope,intent,name,system_prompt,version,enabled,updated_at").single();
    if (error) {
      console.error("[Prompt API] save failed", { code: error.code });
      return NextResponse.json({ success: false, message: "Could not save prompt." }, { status: 500 });
    }
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const limit = checkRateLimit(`ai-prompts:write:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.id !== "string" || typeof body.name !== "string" ||
        !body.name.trim() || body.name.length > 120 || !validProvider(body.provider) ||
        typeof body.systemPrompt !== "string" || !body.systemPrompt.trim() ||
        body.systemPrompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ success: false, message: "Invalid prompt fields." }, { status: 400 });
    }
    const db = supabaseAdmin();
    const { data: old, error: lookupError } = await db.from("ai_prompts")
      .select("id,version").eq("id", body.id).eq("account_id", ctx.accountId).eq("scope", "account").maybeSingle();
    if (lookupError || !old) return NextResponse.json({ success: false, message: "Prompt not found." }, { status: 404 });

    const { data, error } = await db.from("ai_prompts").insert({
      account_id: ctx.accountId, provider: body.provider, scope: "account",
      intent: body.intent ?? null, name: body.name.trim(),
      system_prompt: body.systemPrompt.trim(), version: old.version + 1,
      enabled: body.enabled !== false,
    }).select("id,account_id,provider,scope,intent,name,system_prompt,version,enabled,updated_at").single();
    if (error) {
      console.error("[Prompt API] new prompt version failed", { code: error.code });
      return NextResponse.json({ success: false, message: "Could not save prompt version." }, { status: 500 });
    }
    const { error: disableError } = await db.from("ai_prompts").update({ enabled: false })
      .eq("id", body.id).eq("account_id", ctx.accountId);
    if (disableError) console.error("[Prompt API] could not disable old prompt", { code: disableError.code });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const limit = checkRateLimit(`ai-prompts:write:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    if (!body || typeof body.id !== "string") return NextResponse.json({ success: false, message: "Prompt id is required." }, { status: 400 });
    const db = supabaseAdmin();
    const { data, error } = await db.from("ai_prompts").update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("id", body.id).eq("account_id", ctx.accountId).eq("scope", "account")
      .select("id,enabled").maybeSingle();
    if (error) {
      console.error("[Prompt API] disable failed", { code: error.code });
      return NextResponse.json({ success: false, message: "Could not disable prompt." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ success: false, message: "Prompt not found." }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
