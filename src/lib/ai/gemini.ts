import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIResponse } from './types';
import { z } from 'zod';

import { SYSTEM_ROLE } from './prompts/system';
import { BUSINESS_CONTEXT } from './prompts/business';
import { SALES_RULES } from './prompts/sales';
import { OUTPUT_SCHEMA } from './prompts/output';

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
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  // Try fenced JSON block
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  // Try any first JSON object in text
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

const output = z.object({
  reply: z.string().trim().min(1).max(4096),
  intent: z.enum([
    'GENERAL_CHAT',
    'PRICE_QUERY',
    'SERVICE_QUERY',
    'SERVICE_RECOMMENDATION',
    'BOOK_APPOINTMENT',
    'BOOKING_CONFIRMATION',
    'LOCATION_QUERY',
    'TIMING_QUERY',
    'FOLLOWUP_REQUEST',
    'THERAPIST_QUERY',
    'MEMBERSHIP_QUERY',
    'PAYMENT_QUERY',
    'COMPLAINT',
    'REFUND_REQUEST',
    'HUMAN_SUPPORT',
    'THERAPIST_PHOTO_REQUEST',
  ]),
  confidence: z.number().min(0).max(100),
  handoff: z.boolean(),
});

const openAIOutput = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
});

export async function generateAIReply(message: string): Promise<AIResponse> {
  const prompt = buildPrompt(message);
  const providers: Array<() => Promise<string>> = [];
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const client = new GoogleGenerativeAI(geminiKey);
    const models = (process.env.GEMINI_MODELS ?? 'gemini-flash-latest')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean);
    for (const name of [...new Set(models)].slice(0, 2)) {
      providers.push(async () => {
        const model = client.getGenerativeModel(
          {
            model: name,
            generationConfig: { responseMimeType: 'application/json' },
          },
          { timeout: 6000 }
        );
        return (await model.generateContent(prompt)).response.text();
      });
    }
  }
  const openAIKey = process.env.OPENAI_API_KEY;
  const openAIModel = process.env.OPENAI_MODEL;
  if (openAIKey && openAIModel) {
    providers.push(async () => {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAIKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: openAIModel,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            store: false,
          }),
          signal: AbortSignal.timeout(6000),
        }
      );
      if (!response.ok) throw new Error('AI provider request failed');
      return openAIOutput.parse(await response.json()).choices[0].message
        .content;
    });
  }

  for (const generate of providers) {
    try {
      return output.parse(JSON.parse(extractJson(await generate())));
    } catch {
      // Provider failures and invalid responses advance to the next configured model.
    }
  }
  return getUnavailableReply(message);
}

function getUnavailableReply(message: string): AIResponse {
  const msg = message.toLowerCase();

  // Medical / Safety Escalation
  if (
    msg.includes('pregnant') ||
    msg.includes('pregnancy') ||
    msg.includes('wife pregnant') ||
    msg.includes('pregnant wife') ||
    msg.includes('doctor') ||
    msg.includes('medical') ||
    msg.includes('surgery') ||
    msg.includes('operation')
  ) {
    return {
      reply:
        'Pregnancy ya kisi bhi medical condition ke case me hum direct medical advice nahi dete. Kripya pehle apne doctor se consult karein. Agar doctor massage allow karte hain, to hamari team aapko suitable therapy choose karne me help karegi. 😊',
      intent: 'HUMAN_SUPPORT',
      confidence: 100,
      handoff: true,
    };
  }

  if (
    msg.includes('refund') ||
    msg.includes('money back') ||
    msg.includes('cancel') ||
    msg.includes('return')
  ) {
    return {
      reply:
        'Main aapki request note kar raha hoon. Hamari support team refund ya cancellation me aapki madad karegi.',
      intent: 'REFUND_REQUEST',
      confidence: 90,
      handoff: true,
    };
  }

  if (
    msg.includes('complaint') ||
    msg.includes('problem') ||
    msg.includes('issue') ||
    msg.includes('bad service')
  ) {
    return {
      reply:
        'Hume afsos hai ki aapko problem hui. Hamari support team turant aapse connect karegi.',
      intent: 'HUMAN_SUPPORT',
      confidence: 90,
      handoff: true,
    };
  }

  if (
    msg.includes('call me') ||
    msg.includes('follow up') ||
    msg.includes('kal call') ||
    msg.includes('baad me') ||
    msg.includes('later') ||
    msg.includes('contact karna') ||
    msg.includes('baad') ||
    msg.includes('bad me') ||
    msg.includes('phir') ||
    msg.includes('call karna')
  ) {
    return {
      reply: 'Sure 😊 Main follow-up request note kar raha hoon.',
      intent: 'FOLLOWUP_REQUEST',
      confidence: 80,
      handoff: false,
    };
  }

  if (
    msg.includes('price') ||
    msg.includes('cost') ||
    msg.includes('charge') ||
    msg.includes('rate')
  ) {
    return {
      reply: 'Pricing ke liye aap kis service me interested hain? 😊',
      intent: 'PRICE_QUERY',
      confidence: 80,
      handoff: false,
    };
  }

  return {
    reply: 'Thank you 😊 Hamari team aapse shortly connect karegi.',
    intent: 'HUMAN_SUPPORT',
    confidence: 100,
    handoff: true,
  };
}
