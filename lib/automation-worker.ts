import 'server-only';
import { executeStep } from './automations';
import { openToken } from './whatsapp/core';
import { approvedTemplate, deliverMessage, tokenKey, whatsappAdmin } from './whatsapp/server';

const unavailable = 'Automation action unavailable';

export async function runAutomation() {
  const db = whatsappAdmin();
  const {data,error} = await db.rpc('claim_automation').maybeSingle();
  if (error) throw new Error('Automation claim failed.');
  if (!data) return false;
  const run = data as {
    org_id:string; id:string; lease_id:string; contact_id:string|null; conversation_id:string|null;
    trigger_kind:string; step_index:number; steps:unknown;
  };
  const org = run.org_id;
  const settle = async (result:string,wait=0) => {
    const {data,error} = await db.rpc('settle_automation',{
      p_org:org,p_run:run.id,p_lease:run.lease_id,p_result:result,p_wait:wait,
    });
    if (error || data !== true) throw new Error('Automation lease update failed.');
  };
  let outcome: {result:string;wait:number};
  try {
    const contact = run.contact_id ? await db.from('contacts').select('kind,phone_e164')
      .eq('org_id',org).eq('id',run.contact_id).maybeSingle() : null;
    if (contact?.error) throw new Error('Automation contact lookup failed.');
    outcome = await executeStep(run,contact?.data?.kind ?? null,async step => {
      if (step.kind === 'tag') {
        if (!run.contact_id) throw new Error(unavailable);
        const {error} = await db.from('contact_tag_links').upsert(
          {org_id:org,contact_id:run.contact_id,tag_id:step.tag},
          {onConflict:'org_id,contact_id,tag_id',ignoreDuplicates:true},
        );
        if (error) throw new Error(error.code === '23503' ? unavailable : 'Automation tag could not be stored.');
        return;
      }
      if (step.kind === 'webhook') {
        const endpoint = process.env.AUTOMATION_WEBHOOK_URL;
        if (!endpoint) throw new Error(unavailable);
        const url = new URL(endpoint);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error(unavailable);
        await settle('external');
        const response = await fetch(url,{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store',
          headers:{'Content-Type':'application/json','Idempotency-Key':run.id + ':' + run.step_index},
          body:JSON.stringify({run_id:run.id,trigger:run.trigger_kind,step:run.step_index}),
        });
        if (response.body) await response.body.cancel();
        if (!response.ok) throw new Error(unavailable);
        return;
      }
      if (!run.conversation_id || !run.contact_id || !contact?.data) throw new Error(unavailable);
      const {data:thread,error:threadError} = await db.from('whatsapp_conversations').select('phone_number_id')
        .eq('org_id',org).eq('id',run.conversation_id).eq('contact_id',run.contact_id).maybeSingle();
      if (threadError) throw new Error('Automation conversation lookup failed.');
      if (!thread) throw new Error(unavailable);
      const channel = await db.from('whatsapp_channels').select('waba_id,encrypted_token,key_version')
        .eq('org_id',org).eq('phone_number_id',thread.phone_number_id).maybeSingle();
      if (channel.error) throw new Error('Automation channel lookup failed.');
      if (!channel.data) throw new Error(unavailable);
      const {waba_id,encrypted_token,key_version} = channel.data;
      const token = openToken(encrypted_token,tokenKey(key_version),org,thread.phone_number_id,key_version);
      if (!(await approvedTemplate(waba_id,token,{name:step.template,language:step.language}))) throw new Error(unavailable);
      const consent = await db.from('whatsapp_consent').select('opted_in')
        .eq('org_id',org).eq('contact_id',run.contact_id).maybeSingle();
      if (consent.error) throw new Error('Automation consent lookup failed.');
      if (!consent.data?.opted_in) throw new Error(unavailable);
      await settle('external');
      const message = await deliverMessage(thread.phone_number_id,token,contact.data.phone_e164,{
        type:'template',template:{name:step.template,language:{code:step.language}},
      });
      const {error} = await db.rpc('store_outbound_whatsapp',{
        p_org:org,p_number:thread.phone_number_id,p_thread:run.conversation_id,p_id:message,p_body:'Template: ' + step.template,
      });
      if (error) throw new Error('Automation message could not be stored.');
    });
  } catch (error) {
    outcome = {result:error instanceof Error && error.message === unavailable ? 'fail' : 'retry',wait:0};
  }
  await settle(outcome.result,outcome.wait);
  return true;
}
