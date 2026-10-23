import { generateAIReply } from "./gemini";
import { getRuleBasedReply } from "./rule-router";
import { loadRuntimeAISettings } from "./provider-settings";
import type { AIContext } from "./types";

export type { AIContext } from "./types";

/** Deterministic rule replies remain first; provider settings affect only the generative fallback. */
export async function routeToAI(message: string, context?: AIContext) {
  const ruleReply = getRuleBasedReply(message);
  if (ruleReply) return ruleReply;

  const settings = context?.accountId
    ? await loadRuntimeAISettings(context.accountId)
    : null;
  const configuredContext = settings
    ? {
        ...context,
        customInstructions: settings.customInstructions,
        businessKnowledge: settings.businessKnowledge,
      }
    : context;

  return generateAIReply(
    message,
    configuredContext,
    settings
      ? { provider: settings.provider, model: settings.model, apiKey: settings.apiKey }
      : undefined,
  );
}
