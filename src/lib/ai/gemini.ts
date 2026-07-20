import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIResponse, AIIntent } from "./types";

import { SYSTEM_ROLE } from "./prompts/system";
import { BUSINESS_CONTEXT } from "./prompts/business";
import { SALES_RULES } from "./prompts/sales";
import { OUTPUT_SCHEMA } from "./prompts/output";

const apiKey = process.env.GEMINI_API_KEY;

function buildPrompt(message: string) {
  return `
${SYSTEM_ROLE}

${BUSINESS_CONTEXT}

${SALES_RULES}

Customer Message:
${message}

${OUTPUT_SCHEMA}
`;
}

function extractJson(text: string): string {
  const trimmed = text.trim();

  // Try raw JSON first
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  // Try fenced JSON block
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  // Try any first JSON object in text
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function normalizeAIResponse(parsed: unknown, fallbackText: string): AIResponse {
  if (
    parsed &&
    typeof parsed === "object" &&
    "reply" in parsed &&
    "intent" in parsed &&
    "confidence" in parsed &&
    "handoff" in parsed
  ) {
    const obj = parsed as {
      reply?: unknown;
      intent?: unknown;
      confidence?: unknown;
      handoff?: unknown;
    };

    return {
      reply:
        typeof obj.reply === "string" && obj.reply.trim()
          ? obj.reply.trim()
          : fallbackText,
      intent:
  (typeof obj.intent === "string" && obj.intent.trim()
    ? obj.intent.trim()
    : "GENERAL_CHAT") as AIIntent,
      confidence:
        typeof obj.confidence === "number"
          ? obj.confidence
          : Number(obj.confidence) || 50,
      handoff: Boolean(obj.handoff),
    };
  }

  return {
    reply: fallbackText,
    intent: "GENERAL_CHAT",
    confidence: 50,
    handoff: false,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithTimeout(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  prompt: string,
  timeoutMs = 30000,
) {
  return await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Gemini timeout after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}

async function generateWithRetry(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  prompt: string,
  timeoutMs = 30000,
  retries = 1,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await generateWithTimeout(model, prompt, timeoutMs);
    } catch (err: any) {
      lastError = err;

      const retryable =
        err?.message?.includes("timeout") ||
        err?.status === 429 ||
        err?.status === 500 ||
        err?.status === 503;

      if (!retryable || attempt === retries) {
        throw err;
      }

      console.log(
        `[Gemini Retry] Attempt ${attempt + 1} failed. Retrying in 2 seconds...`,
      );

      await sleep(2000);
    }
  }

  throw lastError;
}

export async function generateAIReply(
  message: string,
  conversationId?: string,
  contactId?: string,
): Promise<AIResponse> {

  if (!apiKey) {
    return {
      reply: "AI is not configured.",
      intent: "GENERAL_CHAT",
      confidence: 0,
      handoff: true,
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
  });

  const prompt = buildPrompt(message);

  try {
    const result = (await generateWithRetry(
  model,
  prompt,
  30000,
  1,
)) as Awaited<ReturnType<typeof model.generateContent>>;

    const text = result.response.text();
    const cleaned = extractJson(text);

    try {
      const parsed = JSON.parse(cleaned);
      return normalizeAIResponse(parsed, cleaned);
    } catch (parseError) {
      console.error("AI JSON Parse Error:", parseError);
      return {
        reply: cleaned,
        intent: "GENERAL_CHAT",
        confidence: 50,
        handoff: false,
      };
    }
  } catch (error) {
    console.error("Gemini Request Failed:", error);

    const msg = message.toLowerCase();

    // Medical / Safety Escalation
if (
  msg.includes("pregnant") ||
  msg.includes("pregnancy") ||
  msg.includes("wife pregnant") ||
  msg.includes("pregnant wife") ||
  msg.includes("doctor") ||
  msg.includes("medical") ||
  msg.includes("surgery") ||
  msg.includes("operation")
) {
  return {
    reply:
      "Pregnancy ya kisi bhi medical condition ke case me hum direct medical advice nahi dete. Kripya pehle apne doctor se consult karein. Agar doctor massage allow karte hain, to hamari team aapko suitable therapy choose karne me help karegi. 😊",
    intent: "HUMAN_SUPPORT",
    confidence: 100,
    handoff: true,
  };
}

if (
  msg.includes("refund") ||
  msg.includes("money back") ||
  msg.includes("cancel") ||
  msg.includes("return")
) {
  return {
    reply:
      "Main aapki request note kar raha hoon. Hamari support team refund ya cancellation me aapki madad karegi.",
    intent: "REFUND_REQUEST",
    confidence: 90,
    handoff: true,
  };
}

if (
  msg.includes("complaint") ||
  msg.includes("problem") ||
  msg.includes("issue") ||
  msg.includes("bad service")
) {
  return {
    reply:
      "Hume afsos hai ki aapko problem hui. Hamari support team turant aapse connect karegi.",
    intent: "HUMAN_SUPPORT",
    confidence: 90,
    handoff: true,
  };
}

    if (
      msg.includes("call me") ||
      msg.includes("follow up") ||
      msg.includes("kal call") ||
      msg.includes("baad me") ||
      msg.includes("later") ||
      msg.includes("contact karna") ||
      msg.includes("baad") ||
      msg.includes("bad me") ||
      msg.includes("phir") ||
      msg.includes("call karna")
    ) {
      return {
        reply: "Sure 😊 Main follow-up request note kar raha hoon.",
        intent: "FOLLOWUP_REQUEST",
        confidence: 80,
        handoff: false,
      };
    }

    if (
      msg.includes("price") ||
      msg.includes("cost") ||
      msg.includes("charge") ||
      msg.includes("rate")
    ) {
      return {
        reply: "Pricing ke liye aap kis service me interested hain? 😊",
        intent: "PRICE_QUERY",
        confidence: 80,
        handoff: false,
      };
    }

    return {
      reply: "Thank you 😊 Hamari team aapse shortly connect karegi.",
      intent: "HUMAN_SUPPORT",
      confidence: 100,
      handoff: true,
    };
  }
}