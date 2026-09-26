import { generateAIReply } from "./gemini";
import { getRuleBasedReply } from "./rule-router";
import type {
  AIContext,
} from "./types";

export type {
  AIContext,
} from "./types";

export async function routeToAI(
  message: string,
  context?: AIContext,
) {
  const ruleReply =
    getRuleBasedReply(message);

  if (ruleReply) {
    return ruleReply;
  }

  return generateAIReply(
    message,
    context,
  );
}
