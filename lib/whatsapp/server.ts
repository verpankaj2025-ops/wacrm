import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Template } from './core';

export function whatsappAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('WhatsApp data service is unavailable.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

export function tokenKey(version: number) {
  const key = process.env['WHATSAPP_TOKEN_KEY_V' + version];
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error('WhatsApp encryption key is unavailable.');
  return Buffer.from(key,'hex');
}

async function graph(path:string, token:string, body?:unknown):Promise<unknown> {
  const version = process.env.WHATSAPP_GRAPH_VERSION;
  if (!version || !/^v\d{1,3}\.\d$/.test(version)) throw new Error('WhatsApp Graph API version is unavailable.');
  const response = await fetch('https://graph.facebook.com/' + version + '/' + path,{
    method:body ? 'POST' : 'GET',
    headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'},
    body:body ? JSON.stringify(body) : undefined,
    cache:'no-store', redirect:'error', signal:AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('WhatsApp provider request failed.');
  return response.json();
}

const templates = z.object({data:z.array(z.object({
  name:z.string(),language:z.string(),status:z.string(),
  components:z.array(z.object({type:z.string(),text:z.string().optional(),format:z.string().optional()})),
}))});

export async function approvedTemplate(waba:string, token:string, candidate:Template) {
  const query = new URLSearchParams({name:candidate.name,fields:'name,language,status,components',limit:'100'});
  const result = templates.parse(await graph(waba + '/message_templates?' + query,token));
  return result.data.some(item => item.name === candidate.name && item.language === candidate.language &&
    item.status === 'APPROVED' && item.components.some(part => part.type === 'BODY') &&
    item.components.every(part => ['BODY','FOOTER','HEADER'].includes(part.type) &&
      (part.type !== 'HEADER' || part.format === 'TEXT') && !part.text?.includes('{{')));
}

export async function deliverMessage(number:string, token:string, recipient:string, payload:object) {
  const response = z.object({messages:z.array(z.object({id:z.string().min(1).max(512)})).min(1)})
    .parse(await graph(number + '/messages',token,{
      messaging_product:'whatsapp',recipient_type:'individual',to:recipient.replace(/^\+/,''),...payload,
    }));
  return response.messages[0].id;
}

export async function verifyChannel(waba:string, number:string, token:string) {
  const page = z.object({
    data:z.array(z.object({id:z.string()})),
    paging:z.object({next:z.string().optional(),cursors:z.object({after:z.string().optional()}).optional()}).optional(),
  });
  let after: string | undefined;
  for (let index = 0; index < 5; index++) {
    const query = new URLSearchParams({fields:'id',limit:'100'});
    if (after) query.set('after',after);
    const result = page.parse(await graph(waba + '/phone_numbers?' + query,token));
    if (result.data.some(item => item.id === number)) return true;
    if (!result.paging?.next || !result.paging.cursors?.after || result.paging.cursors.after === after) return false;
    after = result.paging.cursors.after;
  }
  return false;
}
