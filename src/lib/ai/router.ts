import { generateAIReply } from './gemini';
import { getRuleBasedReply } from './rule-router';

export async function routeToAI(message: string) {
  return getRuleBasedReply(message) ?? generateAIReply(message);
}
