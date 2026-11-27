import { after } from 'next/server';
import { Redis } from '@upstash/redis';
import { equalSecret, parseWebhook, validSignature } from '../../../../lib/whatsapp/core';
import { processWebhook } from '../../../../lib/whatsapp/process';
import { whatsappAdmin } from '../../../../lib/whatsapp/server';

export const runtime = 'nodejs';
const maxBytes = 1024 * 1024;

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  const challenge = params.get('hub.challenge');
  if (!token || params.get('hub.mode') !== 'subscribe' || !challenge || challenge.length > 128
      || !equalSecret(token,params.get('hub.verify_token') ?? '')) {
    return new Response(null,{status:403});
  }
  return new Response(challenge,{headers:{'Cache-Control':'no-store','Content-Type':'text/plain'}});
}

async function readRaw(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done,value } = await reader.read();
    if (done) return Buffer.concat(parts,size);
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
}

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const signature = request.headers.get('x-hub-signature-256');
  if (!secret || !signature) return new Response(null,{status:401});
  const raw = await readRaw(request).catch(() => null);
  if (!raw) return new Response(null,{status:413});
  if (!validSignature(raw,signature,secret)) return new Response(null,{status:401});
  let events: ReturnType<typeof parseWebhook>;
  try {
    events = parseWebhook(JSON.parse(raw.toString('utf8')));
  } catch {
    return new Response(null,{status:400});
  }
  if (!events.size) return new Response(null,{status:200});

  try {
    const db = whatsappAdmin();
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    const redis = url && token ? new Redis({url,token,signal:() => AbortSignal.timeout(250),retry:false}) : null;
    await processWebhook(events,{
      async route(number) {
        const {data,error} = await db.rpc('whatsapp_route',{p_number:number});
        if (error) throw new Error('Webhook routing failed.');
        return data;
      },
      async ingest(org,number,batch) {
        const {error} = await db.rpc('ingest_whatsapp',{p_org:org,p_number:number,p_events:batch});
        if (error) throw new Error('Webhook persistence failed.');
      },
      async seen(keys) { return redis ? (await redis.mget(...keys)).map(value => value === 1) : []; },
      async mark(keys) {
        if (!redis) return;
        const pipeline = redis.pipeline();
        for (const key of keys) pipeline.set(key,1,{nx:true,ex:604800});
        await pipeline.exec();
      },
    },after);
    return new Response(null,{status:200});
  } catch {
    // Retry through the provider until the durable write succeeds.
    return new Response(null,{status:503});
  }
}
