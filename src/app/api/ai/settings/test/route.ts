import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { loadRuntimeAISettings } from "@/lib/ai/provider-settings";
import { generateAIReply } from "@/lib/ai/gemini";

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const body = (await request.json()) as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 2000) {
      return NextResponse.json({ error: "message must be 1–2,000 characters" }, { status: 400 });
    }

    const settings = await loadRuntimeAISettings(ctx.accountId);
    const provider = settings?.provider ?? "gemini";
    const model = settings?.model ?? "gemini-2.5-flash";
    const apiKey = settings?.apiKey ?? (provider === "gemini" ? process.env.GEMINI_API_KEY : undefined);
    if (!apiKey) {
      return NextResponse.json({ error: "No API key is configured for the selected AI provider. Save a key in AI Studio first." }, { status: 400 });
    }

    const result = await generateAIReply(
      message,
      {
        customInstructions: settings?.customInstructions ?? "",
        businessKnowledge: settings?.businessKnowledge ?? "",
      },
      { provider, model, apiKey },
    );
    return NextResponse.json({ result, testOnly: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
