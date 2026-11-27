'use server';

import { revalidatePath } from 'next/cache';
import { workflowSchema } from '../../lib/automations';
import { organizationAccess } from '../../lib/organization-access';
import { uuid } from '../../lib/validation';

export async function saveWorkflow(_: {error?:string;status?:string},form:FormData) {
  const access = await organizationAccess();
  if (!access?.org || !['owner','admin'].includes(access.role) || form.get('workspace') !== access.org.org_id) {
    return {error:'You do not have permission to manage this workflow.'};
  }
  const id = uuid.safeParse(form.get('workflow'));
  const raw = form.get('steps');
  if (typeof raw !== 'string' || raw.length > 12000 || (form.has('workflow') && !id.success)) return {error:'Check your workflow.'};
  let steps:unknown;
  try { steps = JSON.parse(raw); } catch { return {error:'Check your workflow steps.'}; }
  const input = workflowSchema.safeParse({
    name:form.get('name'),trigger:form.get('trigger'),keyword:form.get('keyword') ?? '',
    interval:Number(form.get('interval') ?? 5),conversation:form.get('conversation') || null,steps,
  });
  if (!input.success) return {error:'Check the trigger and complete each action.'};
  const {name,trigger,keyword,interval,conversation} = input.data;
  const org = access.org.org_id;
  const table = access.client.from('automation_workflows');
  const row = {
    name,trigger_kind:trigger,keyword:trigger === 'keyword' ? keyword : null,
    interval_minutes:trigger === 'schedule' ? interval : null,
    scheduled_conversation:trigger === 'schedule' ? conversation : null,
    next_at:trigger === 'schedule' ? new Date(Date.now()+interval*60_000).toISOString() : null,
    steps:input.data.steps,enabled:form.get('enabled') === 'on',
  };
  const result = id.success ? await table.update(row).eq('org_id',org).eq('id',id.data).select('id').single()
    : await table.insert({...row,org_id:org}).select('id').single();
  if (result.error) return {error:'The workflow could not be saved.'};
  revalidatePath('/automations');
  return {status:'Workflow saved.'};
}
