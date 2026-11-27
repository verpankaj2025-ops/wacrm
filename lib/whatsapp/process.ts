import { createHash } from 'node:crypto';
import type { WhatsAppEvent } from './core';

type Ports = {
  route: (number:string) => Promise<string|null>;
  ingest: (org:string,number:string,events:WhatsAppEvent[]) => Promise<void>;
  seen: (keys:string[]) => Promise<boolean[]>;
  mark: (keys:string[]) => Promise<void>;
};

export async function processWebhook(groups: Map<string,WhatsAppEvent[]>, ports: Ports, defer: (work:()=>Promise<void>)=>void = work => { void work(); }) {
  await Promise.all(Array.from(groups, async ([number,events]) => {
    const org = await ports.route(number);
    if (!org) return;
    const messages = new Map(events.filter(event => event.kind === 'in').map(event => [
      'relaxio:whatsapp:' + createHash('sha256').update(JSON.stringify([org,number,event.id])).digest('hex'), event,
    ]));
    const keys = [...messages.keys()];
    const cached = keys.length ? await ports.seen(keys).catch(() => []) : [];
    const pending = keys.filter((_,index) => !cached[index]);
    const batch = [...pending.map(key => messages.get(key)!), ...events.filter(event => event.kind === 'status')];
    if (!batch.length) return;
    await ports.ingest(org,number,batch);
    if (pending.length) defer(async () => { await ports.mark(pending).catch(() => undefined); });
  }));
}
