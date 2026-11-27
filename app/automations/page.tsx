import Link from 'next/link';
import { redirect } from 'next/navigation';
import { WorkflowBuilder } from '../../components/workflow-builder';
import { organizationAccess } from '../../lib/organization-access';
import type { Step } from '../../lib/automations';

type Workflow = {
  id:string;name:string;trigger_kind:string;keyword:string|null;interval_minutes:number|null;
  scheduled_conversation:string|null;enabled:boolean;steps:Step[];
};

export default async function Automations() {
  const access = await organizationAccess();
  if (!access) redirect('/login');
  if (!access.org) redirect('/organizations');
  const {client,org,role} = access;
  const canEdit = ['owner','admin'].includes(role);
  const [workflows,runs,tags,threads] = await Promise.all([
    client.from('automation_workflows').select('id,name,trigger_kind,keyword,interval_minutes,scheduled_conversation,enabled,steps')
      .eq('org_id',org.org_id).order('name'),
    client.from('automation_runs').select('id,workflow_id,state,run_at,step_index')
      .eq('org_id',org.org_id).order('run_at',{ascending:false}).limit(20),
    canEdit ? client.from('contact_tags').select('id,name').eq('org_id',org.org_id).order('name') : null,
    canEdit ? client.from('whatsapp_conversations').select('id,contacts(name)').eq('org_id',org.org_id)
      .order('activity_at',{ascending:false}).limit(100) : null,
  ]);
  if (workflows.error || runs.error || tags?.error || threads?.error) throw new Error('Could not load automations.');
  const items = workflows.data as Workflow[];
  const options = ((threads?.data ?? []) as unknown as {id:string;contacts:{name:string}|null}[])
    .map(thread=>({id:thread.id,name:thread.contacts?.name ?? 'Conversation'}));
  return <>
    <header className="topbar"><Link href="/organizations">Organizations</Link><span>{org.name}</span></header>
    <main className="workspace stack" key={org.org_id}>
      <h1>Automations</h1>
      {canEdit && <details className="card stack">
        <summary>New workflow</summary>
        <WorkflowBuilder org={org.org_id} tags={tags?.data ?? []} threads={options} />
      </details>}
      <section className="stack">
        <h2>Workflows</h2>
        {!items.length && <p>No workflows yet.</p>}
        {items.map(workflow=>canEdit ? <details key={workflow.id} className="card stack">
          <summary>{workflow.name} · {workflow.enabled ? 'Enabled' : 'Paused'}</summary>
          <WorkflowBuilder key={JSON.stringify(workflow)} org={org.org_id} workflow={workflow} tags={tags?.data ?? []} threads={options} />
        </details> : <p key={workflow.id}>{workflow.name} · {workflow.enabled ? 'Enabled' : 'Paused'}</p>)}
      </section>
      <section className="card stack">
        <h2>Recent runs</h2>
        {!runs.data.length && <p>No runs yet.</p>}
        <ul className="divide">{runs.data.map(run=><li key={run.id}>
          <span>{items.find(item=>item.id===run.workflow_id)?.name ?? 'Workflow'}</span>
          <span className="capitalize">{run.state}</span>
        </li>)}</ul>
      </section>
    </main>
  </>;
}
