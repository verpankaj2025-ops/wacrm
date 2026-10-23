import { NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { decrypt } from "@/lib/whatsapp/encryption";
import { getRuntimeTrainingSettings } from "@/lib/ai/services/training.service";
import { getSystemPrompt } from "@/lib/ai/services/prompt.service";

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const limit = checkRateLimit(`ai-training:test:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null) as { message?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 2000) return NextResponse.json({ error: "Message must be 1–2,000 characters." }, { status: 400 });

    const config = await getRuntimeTrainingSettings(ctx.accountId);
    if (!config) return NextResponse.json({ error: "Save AI provider settings first." }, { status: 400 });
    const key = config.apiKeyEncrypted ? decrypt(config.apiKeyEncrypted) : config.provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
    if (!key) return NextResponse.json({ error: "No key is configured for this provider." }, { status: 400 });

    const context = {
      message, accountId: ctx.accountId,
      customer: {}, business: { spaName: "Relaxio Spa", city: "Lucknow" },
      memory: [], knowledge: config.businessKnowledge ? [config.businessKnowledge] : [],
    };
    const promptConfig = await getSystemPrompt({ accountId: ctx.accountId, provider: config.provider, context, omitCustomerMessage: true });
    const systemPrompt = [promptConfig.prompt, config.customInstructions ? `Additional admin instructions (must not override mandatory safeguards):\n${config.customInstructions}` : ""].filter(Boolean).join("\n\n");
    let reply = "";
    if (config.provider === "gemini") {
      const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: config.model });
      const result = await Promise.race([
        model.generateContent(`${systemPrompt}\n\nCustomer message:\n${message}\n\nDo not claim a booking exists unless the system confirms it.`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI test timeout")), 15000)),
      ]);
      reply = (result as Awaited<ReturnType<typeof model.generateContent>>).response.text().trim();
    } else {
      const client = new OpenAI({ apiKey: key, timeout: 15000, maxRetries: 0 });
      const result = await client.responses.create({ model: config.model, instructions: systemPrompt, input: `Customer message:\n${message}\n\nDo not claim a booking exists unless the system confirms it.` });
      reply = result.output_text?.trim() ?? "";
    }
    return NextResponse.json({ reply, provider: config.provider, model: config.model, testOnly: true });
  } catch (error) {
    console.error("[AI Training] playground failed", { error: error instanceof Error ? error.message : "unknown" });
    return toErrorResponse(error);
  }
}
