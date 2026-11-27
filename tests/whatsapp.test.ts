import { createHmac } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { sealToken, openToken, validSignature, chooseSend, parseWebhook } from '../lib/whatsapp/core';
import { processWebhook } from '../lib/whatsapp/process';

const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const phone = '12345';
const sample = (metadata = phone) => ({ object:'whatsapp_business_account', entry:[{ id:'untrusted', changes:[{
  field:'messages', value:{ metadata:{ phone_number_id:metadata }, messages:[{
    id:'wamid.in', from:'919876543210', timestamp:'1760000000', type:'text', text:{ body:'STOP' }, org_id:'untrusted',
  }] },
}]}] });

test('verifies the raw webhook HMAC and rejects a modified body or invalid signature', () => {
  const raw = Buffer.from(JSON.stringify(sample()));
  const signature = 'sha256=' + createHmac('sha256','test-secret').update(raw).digest('hex');
  expect(validSignature(raw, signature,'test-secret')).toBe(true);
  expect(validSignature(Buffer.concat([raw,Buffer.from(' ')]), signature,'test-secret')).toBe(false);
  expect(validSignature(raw, 'sha256=abc','test-secret')).toBe(false);
});

test('token encryption is randomized and bound to tenant, phone and key version', () => {
  const key = Buffer.alloc(32,1);
  const secret = 'test-token-private';
  const value = sealToken(secret,key,org,phone,1);
  expect(value).not.toContain(secret);
  expect(sealToken(secret,key,org,phone,1)).not.toBe(value);
  expect(openToken(value,key,org,phone,1)).toBe(secret);
  expect(() => openToken(value,key,org,'56789',1)).toThrow();
  expect(() => openToken(value,key,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',phone,1)).toThrow();
  expect(() => openToken(value,key,org,phone,2)).toThrow();
});

test('send requires recorded opt-in and a trusted template at the 24-hour boundary', () => {
  const now = Date.parse('2026-01-02T12:00:00Z');
  const text = { text:'hello' };
  const template = { ...text, template:{ name:'hello_world', language:'en_US' } };
  expect(chooseSend(false,'2026-01-02T11:00:00Z',template,now)).toBeNull();
  expect(chooseSend(true,'2026-01-01T12:00:01Z',text,now)).toEqual({ type:'text', text:{body:'hello'} });
  expect(chooseSend(true,'2026-01-01T12:00:00Z',text,now)).toBeNull();
  expect(chooseSend(true,null,template,now)).toEqual({ type:'template', template:{name:'hello_world',language:{code:'en_US'}} });
});

test('webhook uses only the registered org and caches replay IDs only after database success', async () => {
  const events = parseWebhook(sample());
  const cache = new Set<string>();
  const ingest = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const ports = {
    route: vi.fn().mockResolvedValue(org), ingest,
    seen: async (keys: string[]) => keys.map(key => cache.has(key)),
    mark: async (keys: string[]) => { for(const key of keys) cache.add(key); },
  };
  await expect(processWebhook(events,ports)).rejects.toThrow();
  expect(cache.size).toBe(0);
  await processWebhook(events,ports);
  await processWebhook(events,ports);
  expect(ingest).toHaveBeenCalledTimes(2);
  expect(ingest).toHaveBeenLastCalledWith(org,phone,[{kind:'in',id:'wamid.in',from:'919876543210',body:'STOP',timestamp:'1760000000'}]);
  ports.route.mockResolvedValue(null);
  await processWebhook(parseWebhook(sample('56789')),ports);
  expect(ingest).toHaveBeenCalledTimes(2);
});
