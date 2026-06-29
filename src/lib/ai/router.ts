import { generateAIReply } from "./gemini";
import { getRuleBasedReply } from "./rule-router";

export async function routeToAI(
  message: string,
) {

  const ruleReply =
    getRuleBasedReply(message);

  if (ruleReply) {
    return ruleReply;
  }

  return generateAIReply(message);
}