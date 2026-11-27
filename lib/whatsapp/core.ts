import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const providerId = z.string().regex(/^\d{5,32}$/);
export const templateName = z.string().regex(/^[a-z0-9_]{1,128}$/);
export const templateLanguage = z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/);
const id = z.string().min(1).max(512);
const timestamp = z.string().regex(/^\d{1,10}$/);
const inbound = z.object({
  id, timestamp, from:z.string().regex(/^[1-9]\d{1,14}$/),
  type:z.string().max(80), text:z.object({body:z.string().max(4096)}).optional(),
});
const receipt = z.object({ id, timestamp, status:z.enum(['sent','delivered','read','failed']) });
const envelope = z.object({
  object:z.literal('whatsapp_business_account'),
  entry:z.array(z.object({changes:z.array(z.object({field:z.string(),value:z.unknown()}))})),
});
const change = z.object({
  metadata:z.object({phone_number_id:providerId}),
  messages:z.array(z.unknown()).optional(),
  statuses:z.array(z.unknown()).optional(),
});

export type WhatsAppEvent =
  | { kind:'in'; id:string; timestamp:string; from:string; body:string }
  | { kind:'status'; id:string; timestamp:string; status:z.infer<typeof receipt>['status'] };

export function parseWebhook(input: unknown) {
  const result = new Map<string, WhatsAppEvent[]>();
  for (const entry of envelope.parse(input).entry) {
    for (const item of entry.changes) {
      if (item.field !== 'messages') continue;
      const parsed = change.safeParse(item.value);
      if (!parsed.success) continue;
      const value = parsed.data;
      const number = value.metadata.phone_number_id;
      const events = result.get(number) ?? [];
      for (const raw of value.messages ?? []) {
        const event = inbound.safeParse(raw);
        if (!event.success) continue;
        const { id, timestamp, from, type, text } = event.data;
        events.push({kind:'in',id,timestamp,from,body:(type === 'text' && text ? text.body : 'Unsupported WhatsApp message').replaceAll('\0','')});
      }
      for (const raw of value.statuses ?? []) {
        const event = receipt.safeParse(raw);
        if (event.success) events.push({kind:'status',...event.data});
      }
      if (events.length) result.set(number,events);
    }
  }
  return result;
}

export function equalSecret(expected: string, actual: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a,b);
}

export function validSignature(raw: Uint8Array, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return equalSecret('sha256=' + createHmac('sha256',secret).update(raw).digest('hex'),signature);
}

export function sealToken(token: string, key: Buffer, org: string, phone: string, version: number) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(`${org}:${phone}:${version}`));
  const encrypted = Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(value => value.toString('base64url')).join('.');
}

export function openToken(value: string, key: Buffer, org: string, phone: string, version: number) {
  const [iv,tag,encrypted] = value.split('.').map(part => Buffer.from(part,'base64url'));
  const decipher = createDecipheriv('aes-256-gcm',key,iv,{authTagLength:16});
  decipher.setAAD(Buffer.from(`${org}:${phone}:${version}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8');
}

export type Template = {name:string; language:string};
export function chooseSend(optedIn: boolean, lastInbound: string | null, input: {text?:string;template?:Template}, now = Date.now()) {
  if (!optedIn) return null;
  const inboundAt = lastInbound ? Date.parse(lastInbound) : NaN;
  if (input.text && inboundAt <= now && now - inboundAt < 86_400_000) {
    return {type:'text' as const,text:{body:input.text}};
  }
  if (input.template) return {type:'template' as const,template:{name:input.template.name,language:{code:input.template.language}}};
  return null;
}
