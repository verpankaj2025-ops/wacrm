create table public.automation_workflows (
  org_id uuid not null references public.organizations on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  trigger_kind text not null check (trigger_kind in ('inbound','keyword','contact','schedule')),
  keyword text,
  interval_minutes integer,
  scheduled_conversation uuid,
  next_at timestamptz,
  enabled boolean not null default false,
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 10),
  primary key (org_id,id),
  foreign key (org_id,scheduled_conversation) references public.whatsapp_conversations on delete set null (scheduled_conversation),
  check (case when trigger_kind='keyword' then keyword is not null and char_length(btrim(keyword)) between 1 and 80 else keyword is null end),
  check (case when trigger_kind='schedule' then interval_minutes is not null and interval_minutes between 5 and 10080 and next_at is not null
    else interval_minutes is null and scheduled_conversation is null and next_at is null end)
);
create index automation_trigger_idx on public.automation_workflows(org_id,trigger_kind) where enabled;
create index automation_schedule_idx on public.automation_workflows(next_at) where enabled and trigger_kind='schedule';

create table public.automation_runs (
  org_id uuid not null,
  id uuid not null default gen_random_uuid(),
  workflow_id uuid not null,
  event_key text not null,
  trigger_kind text not null,
  contact_id uuid,
  conversation_id uuid,
  steps jsonb not null,
  step_index integer not null default 0,
  attempts integer not null default 0,
  run_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  external_started boolean not null default false,
  state text not null default 'queued' check (state in ('queued','running','done','failed')),
  primary key (org_id,id),
  unique (org_id,workflow_id,event_key),
  foreign key (org_id,workflow_id) references public.automation_workflows on delete cascade,
  foreign key (org_id,contact_id) references public.contacts on delete set null (contact_id),
  foreign key (org_id,conversation_id) references public.whatsapp_conversations on delete set null (conversation_id)
);
create index automation_run_queue_idx on public.automation_runs(run_at) where state='queued';
create index automation_run_lease_idx on public.automation_runs(lease_until) where state='running';

alter table public.automation_workflows enable row level security;
alter table public.automation_runs enable row level security;
revoke all on public.automation_workflows,public.automation_runs from public,anon,authenticated;
grant select on public.automation_workflows,public.automation_runs to authenticated;
grant insert (org_id,name,trigger_kind,keyword,interval_minutes,scheduled_conversation,next_at,steps,enabled),
  update (name,trigger_kind,keyword,interval_minutes,scheduled_conversation,next_at,steps,enabled) on public.automation_workflows to authenticated;
grant all on public.automation_workflows,public.automation_runs to service_role;
grant select on public.contacts,public.contact_tags to service_role;
grant select,insert on public.contact_tag_links to service_role;

create policy workflow_read on public.automation_workflows for select to authenticated using (private.member_role(org_id) is not null);
create policy workflow_create on public.automation_workflows for insert to authenticated
  with check (private.member_role(org_id) in ('owner','admin'));
create policy workflow_edit on public.automation_workflows for update to authenticated
  using (private.member_role(org_id) in ('owner','admin'))
  with check (private.member_role(org_id) in ('owner','admin'));
create policy run_read on public.automation_runs for select to authenticated using (private.member_role(org_id) is not null);

create function private.enqueue_automation_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  contact uuid;
begin
  if tg_table_name='contacts' then
    insert into public.automation_runs(org_id,workflow_id,event_key,trigger_kind,contact_id,steps)
    select new.org_id,w.id,'contact:'||new.id,'contact',new.id,w.steps from public.automation_workflows w
    where w.org_id=new.org_id and w.enabled and w.trigger_kind='contact'
    on conflict (org_id,workflow_id,event_key) do nothing;
  elsif new.direction='in' then
    select c.contact_id into contact from public.whatsapp_conversations c
      where c.org_id=new.org_id and c.id=new.conversation_id;
    insert into public.automation_runs(org_id,workflow_id,event_key,trigger_kind,contact_id,conversation_id,steps)
    select new.org_id,w.id,'in:'||new.phone_number_id||':'||new.message_id,w.trigger_kind,contact,new.conversation_id,w.steps
    from public.automation_workflows w where w.org_id=new.org_id and w.enabled
      and (w.trigger_kind='inbound' or (w.trigger_kind='keyword' and position(lower(w.keyword) in lower(new.body))>0))
    on conflict (org_id,workflow_id,event_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function private.enqueue_automation_event() from public,anon,authenticated;
create trigger automation_contact_created after insert on public.contacts
  for each row execute function private.enqueue_automation_event();
create trigger automation_message_received after insert on public.whatsapp_messages
  for each row execute function private.enqueue_automation_event();

create function public.claim_automation()
returns setof public.automation_runs language plpgsql security invoker set search_path='' as $$
declare
  scheduled public.automation_workflows;
begin
  for scheduled in select * from public.automation_workflows where enabled and trigger_kind='schedule'
    and next_at<=now() order by next_at limit 25 for update skip locked
  loop
    insert into public.automation_runs(org_id,workflow_id,event_key,trigger_kind,contact_id,conversation_id,steps)
      values (scheduled.org_id,scheduled.id,'schedule:'||extract(epoch from scheduled.next_at),'schedule',
        (select contact_id from public.whatsapp_conversations where org_id=scheduled.org_id and id=scheduled.scheduled_conversation),
        scheduled.scheduled_conversation,scheduled.steps)
      on conflict (org_id,workflow_id,event_key) do nothing;
    update public.automation_workflows set next_at=now()+make_interval(mins=>scheduled.interval_minutes)
      where org_id=scheduled.org_id and id=scheduled.id;
  end loop;

  update public.automation_runs set state='failed',lease_id=null,lease_until=null
    where state='running' and lease_until<=now() and (external_started or attempts>=5);

  return query with candidate as (
    select r.org_id,r.id from public.automation_runs r join public.automation_workflows w
      on (w.org_id,w.id)=(r.org_id,r.workflow_id)
    where w.enabled and ((r.state='queued' and r.run_at<=now()) or
      (r.state='running' and r.lease_until<=now() and not r.external_started and r.attempts<5))
    order by r.run_at,r.id limit 1 for update of r skip locked
  )
  update public.automation_runs r set state='running',lease_id=gen_random_uuid(),
    lease_until=now()+interval '2 minutes',attempts=r.attempts+1
  from candidate where (r.org_id,r.id)=(candidate.org_id,candidate.id) returning r.*;
end $$;

create function public.settle_automation(p_org uuid,p_run uuid,p_lease uuid,p_result text,p_wait integer default 0)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_result='external' then
    update public.automation_runs set external_started=true
      where org_id=p_org and id=p_run and lease_id=p_lease and state='running' and lease_until>now() and not external_started
      and exists(select 1 from public.automation_workflows w where w.org_id=p_org and w.id=workflow_id and w.enabled);
  elsif p_result in ('advance','retry','fail','done') and p_wait between 0 and 604800 then
    update public.automation_runs set
      state=case when p_result='fail' or (p_result='retry' and (attempts>=5 or external_started)) then 'failed'
        when p_result='done' or (p_result='advance' and p_wait=0 and step_index+1>=jsonb_array_length(steps)) then 'done' else 'queued' end,
      run_at=now()+make_interval(secs=>case when p_result='retry' then least(600,15*(2^attempts)::integer) else p_wait end),
      step_index=step_index+case when p_result='advance' then 1 else 0 end,
      attempts=case when p_result='advance' then 0 else attempts end,
      lease_id=null,lease_until=null,external_started=false
      where org_id=p_org and id=p_run and lease_id=p_lease and state='running' and lease_until>now();
  else return false;
  end if;
  return found;
end $$;
revoke all on function public.claim_automation(),public.settle_automation(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_automation(),public.settle_automation(uuid,uuid,uuid,text,integer) to service_role;
