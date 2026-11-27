'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { organizationAccess } from '../../lib/organization-access';
import { uuid } from '../../lib/validation';
import { chooseSend, openToken, providerId, sealToken, templateLanguage, templateName } from '../../lib/whatsapp/core';
import { approvedTemplate, deliverMessage, tokenKey, verifyChannel, whatsappAdmin } from '../../lib/whatsapp/server';

type Result = {status?:string;error?:string};
const denied = {error:'You do not have permission to change this inbox.'};
const failure = {error:'The change could not be saved.'};
const invalid = {error:'Check the details and try again.'};

async function writer(form:FormData) {
  const access = await organizationAccess();
  if (!access?.org || !access.writable || form.get('workspace') !== access.org.org_id) return null;
  return {...access, org:access.org.org_id};
}

function saved(status:string) {
  revalidatePath('/inbox','layout');
  return {status};
}

export async function connectChannel(_:Result,form:FormData):Promise<Result> {
  const access = await writer(form);
  if (!access || !['owner','admin'].includes(access.role)) return denied;
  const input = z.object({number:providerId,waba:providerId,token:z.string().trim().min(16).max(4096)}).safeParse(Object.fromEntries(form));
  if (!input.success) return invalid;
  try {
    const version = Number(process.env.WHATSAPP_TOKEN_KEY_VERSION ?? '1');
    if (!Number.isSafeInteger(version) || version < 1) return failure;
    const {number,waba,token} = input.data;
    if (!(await verifyChannel(waba,number,token))) return {error:"Meta did not verify this number for the supplied business account."};
    const {error} = await whatsappAdmin().from('whatsapp_channels').upsert({
      org_id:access.org,phone_number_id:number,waba_id:waba,
      encrypted_token:sealToken(token,tokenKey(version),access.org,number,version),key_version:version,
    },{onConflict:'org_id,phone_number_id'});
    return error ? failure : saved('WhatsApp number saved.');
  } catch { return failure; }
}

async function threadWriter(form:FormData) {
  const access = await writer(form);
  const id = uuid.safeParse(form.get('thread'));
  if (!access || !id.success) return null;
  const {data,error} = await access.client.from('whatsapp_conversations')
    .select('id,phone_number_id,contact_id,last_inbound_at').eq('org_id',access.org).eq('id',id.data).maybeSingle();
  return error || !data ? null : {...access,thread:data};
}

export async function updateConversation(_:Result,form:FormData):Promise<Result> {
  const access = await threadWriter(form);
  if (!access) return denied;
  const input = z.object({status:z.enum(['open','pending','closed']),assignee:z.union([uuid,z.literal('')])}).safeParse(Object.fromEntries(form));
  if (!input.success) return invalid;
  const {error} = await access.client.from('whatsapp_conversations')
    .update({status:input.data.status,assignee_id:input.data.assignee || null})
    .eq('org_id',access.org).eq('id',access.thread.id).select('id').single();
  return error ? failure : saved('Conversation updated.');
}

export async function addNote(_:Result,form:FormData):Promise<Result> {
  const access = await threadWriter(form);
  if (!access) return denied;
  const note = z.string().trim().min(1).max(2000).safeParse(form.get('note'));
  if (!note.success) return invalid;
  const {error} = await access.client.from('whatsapp_notes').insert({org_id:access.org,conversation_id:access.thread.id,body:note.data});
  return error ? failure : saved('Note added.');
}

export async function recordConsent(_:Result,form:FormData):Promise<Result> {
  const access = await threadWriter(form);
  if (!access) return denied;
  const choice = z.enum(['true','false']).safeParse(form.get('consent'));
  if (!choice.success) return invalid;
  const {error} = await access.client.rpc('record_whatsapp_consent',{
    p_org:access.org,p_contact:access.thread.contact_id,p_opted_in:choice.data === 'true',
  });
  return error ? failure : saved('Consent recorded.');
}

export async function sendMessage(_:Result,form:FormData):Promise<Result> {
  const access = await threadWriter(form);
  if (!access) return denied;
  const input = z.object({
    text:z.string().trim().max(4096),
    template:z.union([templateName,z.literal('')]),
    language:z.union([templateLanguage,z.literal('')]),
  }).safeParse(Object.fromEntries(form));
  if (!input.success) return invalid;
  const {thread,org,client} = access;
  const configured = input.data.template && input.data.language ? {name:input.data.template,language:input.data.language} : undefined;
  if (!input.data.text && !configured) return invalid;
  let dispatched = false;
  try {
    const readConsent = async () => {
      const {data,error} = await client.from('whatsapp_consent').select('opted_in').eq('org_id',org).eq('contact_id',thread.contact_id).maybeSingle();
      if (error) throw new Error('Consent lookup failed.');
      return data?.opted_in === true;
    };
    if (!(await readConsent())) return {error:'This contact has not opted in to WhatsApp messages.'};
    const candidate = {text:input.data.text,template:configured};
    const preliminary = chooseSend(true,thread.last_inbound_at,candidate);
    if (!preliminary) return {error:'Choose an approved template outside the 24-hour service window.'};
    const admin = whatsappAdmin();
    const [channel,contact] = await Promise.all([
      admin.from('whatsapp_channels').select('waba_id,encrypted_token,key_version')
        .eq('org_id',org).eq('phone_number_id',thread.phone_number_id).single(),
      client.from('contacts').select('phone_e164').eq('org_id',org).eq('id',thread.contact_id).single(),
    ]);
    if (channel.error || contact.error) return failure;
    const version = channel.data.key_version;
    const token = openToken(channel.data.encrypted_token,tokenKey(version),org,thread.phone_number_id,version);
    const template = configured && (preliminary.type === 'template' ||
      !chooseSend(true,thread.last_inbound_at,{text:input.data.text},Date.now()+10_000))
      && await approvedTemplate(channel.data.waba_id,token,configured) ? configured : undefined;
    const optedIn = await readConsent();
    if (!optedIn) return {error:'This contact has not opted in to WhatsApp messages.'};
    const payload = chooseSend(optedIn,thread.last_inbound_at,{text:input.data.text,template});
    if (!payload) return {error:'Choose a currently approved template without parameters for this language.'};

    dispatched = true;
    const messageId = await deliverMessage(thread.phone_number_id,token,contact.data.phone_e164,payload);
    const {error} = await admin.rpc('store_outbound_whatsapp',{
      p_org:org,p_number:thread.phone_number_id,p_thread:thread.id,p_id:messageId,
      p_body:payload.type === 'text' ? payload.text.body : 'Template: ' + payload.template.name,
    });
    if (error) throw new Error('Message persistence failed.');
    return saved('Message sent.');
  } catch {
    return {error:dispatched ? 'Delivery could not be confirmed. Check before sending again.' : 'The message could not be sent.'};
  }
}
