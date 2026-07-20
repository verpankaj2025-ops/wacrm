import { generateAIReply } from "./gemini";
import { getRuleBasedReply } from "./rule-router";

export async function routeToAI(
  message: string,
  conversationId?: string,
  contactId?: string,
) {
  const ruleReply = getRuleBasedReply(message);

  if (ruleReply) {
    return ruleReply;
  }

  return generateAIReply(
    message,
    conversationId,
    contactId,
  );
}