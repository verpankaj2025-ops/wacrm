'use client';

import { useState } from 'react';
import { saveWorkflow } from '../app/automations/actions';
import type { Step } from '../lib/automations';
import { ActionForm } from './action-form';
import { Button } from './ui/button';

type Option = {id:string;name:string};
type Workflow = {
  id:string;name:string;trigger_kind:string;keyword:string|null;interval_minutes:number|null;
  scheduled_conversation:string|null;enabled:boolean;steps:Step[];
};
type Draft = {kind:Step['kind'];when:Step['when'];seconds?:number;tag?:string;template?:string;language?:string};

export function WorkflowBuilder({org,workflow,tags,threads}:{
  org:string;workflow?:Workflow;tags:Option[];threads:Option[];
}) {
  const [trigger,setTrigger] = useState(workflow?.trigger_kind ?? 'inbound');
  const [steps,setSteps] = useState<Draft[]>(workflow?.steps ?? [{kind:'wait',when:'always',seconds:60}]);
  function update(index:number,replacement:Draft) {
    setSteps(current => current.map((value,i) => i===index ? replacement : value));
  }
  function move(index:number,direction:number) {
    const target = index+direction;
    if (target<0 || target>=steps.length) return;
    setSteps(current => current.map((step,i) => i===index ? current[target] : i===target ? current[index] : step));
  }
  return <ActionForm action={saveWorkflow} org={org} label="Save workflow">
    {workflow && <input type="hidden" name="workflow" value={workflow.id} />}
    <label>Workflow name<input name="name" defaultValue={workflow?.name} maxLength={80} required /></label>
    <label>Trigger<select name="trigger" value={trigger} onChange={event=>setTrigger(event.target.value)}>
      <option value="inbound">Inbound WhatsApp message</option><option value="keyword">Message contains keyword</option>
      <option value="contact">New contact</option><option value="schedule">Recurring schedule</option>
    </select></label>
    {trigger==='keyword' && <label>Keyword<input name="keyword" defaultValue={workflow?.keyword ?? ''} maxLength={80} required /></label>}
    {trigger==='schedule' && <>
      <label>Repeat every (minutes)<input name="interval" type="number" min={5} max={10080} defaultValue={workflow?.interval_minutes ?? 5} required /></label>
      <label>Conversation<select name="conversation" defaultValue={workflow?.scheduled_conversation ?? ''}>
        <option value="">No conversation</option>
        {threads.map(thread=><option key={thread.id} value={thread.id}>{thread.name}</option>)}
      </select></label>
    </>}
    <input type="hidden" name="steps" value={JSON.stringify(steps)} />
    <ol className="stack">
      {steps.map((step,index)=><li className="card stack" key={index}>
        <h3>Step {index+1}</h3>
        <label>Run when<select value={step.when} onChange={event=>update(index,{...step,when:event.target.value as Step['when']})}>
          <option value="always">Always</option><option value="lead">Contact is a lead</option>
          <option value="contact">Contact is a regular contact</option><option value="inbound">Inbound or keyword trigger</option>
          <option value="schedule">Scheduled trigger</option>
        </select></label>
        <label>Action<select value={step.kind} onChange={event=>update(index,{when:step.when,kind:event.target.value as Step['kind'],
          ...(event.target.value==='wait' ? {seconds:60} : {})})}>
          <option value="wait">Wait</option><option value="tag">Attach tag</option>
          <option value="message">Send approved WhatsApp template</option><option value="webhook">Notify configured webhook</option>
        </select></label>
        {step.kind==='wait' && <label>Wait (seconds)<input type="number" min={1} max={604800} value={step.seconds ?? ''}
          onChange={event=>update(index,{...step,seconds:event.target.valueAsNumber})} required /></label>}
        {step.kind==='tag' && <label>Tag<select value={step.tag ?? ''} required onChange={event=>update(index,{...step,tag:event.target.value})}>
          <option value="">Choose a tag</option>{tags.map(tag=><option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select></label>}
        {step.kind==='message' && <>
          <label>Template name<input value={step.template ?? ''} maxLength={128} onChange={event=>update(index,{...step,template:event.target.value})} required /></label>
          <label>Template language<input value={step.language ?? ''} maxLength={12} onChange={event=>update(index,{...step,language:event.target.value})} required /></label>
        </>}
        <div className="row">
          <Button type="button" variant="outline" disabled={index===0} onClick={()=>move(index,-1)}>Move up</Button>
          <Button type="button" variant="outline" disabled={index===steps.length-1} onClick={()=>move(index,1)}>Move down</Button>
          <Button type="button" variant="outline" disabled={steps.length===1} onClick={()=>setSteps(current=>current.filter((_,i)=>i!==index))}>Remove</Button>
        </div>
      </li>)}
    </ol>
    <Button type="button" variant="outline" disabled={steps.length===10}
      onClick={()=>setSteps(current=>[...current,{when:'always',kind:'wait',seconds:60}])}>Add step</Button>
    <label><span><input type="checkbox" name="enabled" defaultChecked={workflow?.enabled} /> Enable workflow</span></label>
  </ActionForm>;
}
