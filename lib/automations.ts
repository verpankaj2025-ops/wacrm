import { z } from 'zod';
import { uuid } from './validation';
import { templateLanguage, templateName } from './whatsapp/core';

const when = z.enum(['always','lead','contact','inbound','schedule']);
export const stepSchema = z.discriminatedUnion('kind',[
  z.strictObject({when,kind:z.literal('wait'),seconds:z.number().int().min(1).max(604800)}),
  z.strictObject({when,kind:z.literal('tag'),tag:uuid}),
  z.strictObject({when,kind:z.literal('message'),template:templateName,language:templateLanguage}),
  z.strictObject({when,kind:z.literal('webhook')}),
]);
export const workflowSchema = z.object({
  name:z.string().trim().min(1).max(80),
  trigger:z.enum(['inbound','keyword','contact','schedule']),
  keyword:z.string().trim().max(80),
  interval:z.number().int().min(5).max(10080),
  conversation:uuid.nullable(),
  steps:z.array(stepSchema).min(1).max(10),
}).refine(data => data.trigger !== 'keyword' || !!data.keyword);
export type Step = z.infer<typeof stepSchema>;

export async function executeStep(job:{trigger_kind:string;step_index:number;steps:unknown}, contactKind:string|null,
  perform:(step:Exclude<Step,{kind:'wait'}>)=>Promise<void>) {
  const steps = z.array(stepSchema).min(1).max(10).safeParse(job.steps);
  if (steps.success && job.step_index === steps.data.length) return {result:'done',wait:0};
  const step = steps.success ? steps.data[job.step_index] : undefined;
  if (!step) return {result:'fail',wait:0};
  const matches = step.when === 'always' || step.when === contactKind ||
    (step.when === 'inbound' && ['keyword','inbound'].includes(job.trigger_kind)) ||
    (step.when === 'schedule' && job.trigger_kind === 'schedule');
  if (!matches) return {result:'advance',wait:0};
  if (step.kind === 'wait') return {result:'advance',wait:step.seconds};
  await perform(step);
  return {result:'advance',wait:0};
}
