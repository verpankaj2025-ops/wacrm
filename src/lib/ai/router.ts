import { generateAIReply } from "./gemini";

export async function routeToAI(
  message: string,
) {
  return generateAIReply(message);
}