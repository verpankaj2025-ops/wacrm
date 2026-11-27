'use server';

import { revalidatePath } from 'next/cache';
import { organizationAccess } from '../../lib/organization-access';
import { dealInput, stageInput, stageMoveInput } from '../../lib/pipeline-input';
import { uuid } from '../../lib/validation';

type PipelineResult = { status?: string; error?: string };
const denied = { error: 'You do not have permission to edit this pipeline.' };

async function writer(form: FormData) {
  const access = await organizationAccess();
  const requestedWorkspace = uuid.safeParse(form.get('workspace'));
  if (!access?.org || !access.writable || !requestedWorkspace.success || requestedWorkspace.data !== access.org.org_id) return null;
  return { client: access.client, org: access.org.org_id };
}

function saved(status: string) {
  revalidatePath('/pipeline');
  return { status };
}

export async function addStage(_: PipelineResult, form: FormData): Promise<PipelineResult> {
  const access = await writer(form);
  if (!access) return denied;
  const input = stageInput.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'Enter a stage name and a position between 1 and 10,000.' };
  const { error } = await access.client.from('pipeline_stages').insert({ org_id: access.org, ...input.data });
  if (error?.code === '23505') return { error: 'A stage with that name already exists.' };
  return error ? { error: 'The stage could not be added.' } : saved('Stage added.');
}

export async function addDeal(_: PipelineResult, form: FormData): Promise<PipelineResult> {
  const access = await writer(form);
  if (!access) return denied;
  const input = dealInput.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'Enter a title, contact, stage and valid amount.' };
  const { title, contact, stage, amount } = input.data;
  const { error } = await access.client.from('deals').insert({
    org_id: access.org, title, contact_id: contact, stage_id: stage, amount_inr: amount,
  });
  if (error?.code === '23503') return { error: 'Choose a contact and stage from this organization.' };
  return error ? { error: 'The deal could not be added.' } : saved('Deal added.');
}

export async function moveDeal(_: PipelineResult, form: FormData): Promise<PipelineResult> {
  const access = await writer(form);
  if (!access) return denied;
  const input = stageMoveInput.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'Choose a different stage.' };
  const { deal, from, to } = input.data;
  const { data, error } = await access.client.rpc('move_deal', { p_org: access.org, p_deal: deal, p_from: from, p_to: to });
  if (error?.code === '42501') return denied;
  if (error?.code === '23503') return { error: 'The destination stage is unavailable.' };
  if (error) return { error: 'The deal could not be moved.' };
  if (data !== true) {
    revalidatePath('/pipeline');
    return { error: 'This deal changed. Check its current stage and try again.' };
  }
  return saved('Deal moved.');
}

export async function linkConversation(_:PipelineResult,form:FormData):Promise<PipelineResult> {
  const access = await writer(form);
  if (!access) return denied;
  const deal = uuid.safeParse(form.get('deal'));
  const value = form.get('conversation');
  const thread = value === '' ? {success:true as const,data:null} : uuid.safeParse(value);
  if (!deal.success || !thread.success) return {error:'Choose a valid conversation.'};
  const {error} = await access.client.from('deals').update({conversation_id:thread.data})
    .eq('org_id',access.org).eq('id',deal.data).select('id').single();
  if (error?.code === '23503') return {error:'Choose a conversation from this organization.'};
  return error ? {error:'The conversation link could not be saved.'} : saved('Conversation link saved.');
}
