import { generateAIReply } from "./gemini";
import { getRuleBasedReply } from "./rule-router";

export interface AIContext {
  memoryContext?: string;
}

export async function routeToAI(
  message: string,
  context?: AIContext,
) {

  const ruleReply =
    getRuleBasedReply(message);

  if (ruleReply) {
    return ruleReply;
  }

  return generateAIReply(message, context);
}