create table public.whatsapp_channels (
  org_id uuid not null references public.organizations on delete cascade,
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,32}$'),
  waba_id text not null check (waba_id ~ '^[0-9]{5,32}$'),
  encrypted_token text not null,
  key_version integer not null check (key_version > 0),
  primary key (org_id, phone_number_id)
);
create table public.whatsapp_consent (
  org_id uuid not null,
  contact_id uuid not null,
  opted_in boolean not null,
  source text not null check (source in ('recorded', 'stop')),
  changed_at timestamptz not null default now(),
  primary key (org_id, contact_id),
  foreign key (org_id, contact_id) references public.contacts on delete cascade
);
create table public.whatsapp_conversations (
  org_id uuid not null,
  id uuid not null default gen_random_uuid(),
  phone_number_id text not null,
  contact_id uuid not null,
  assignee_id uuid,
  status text not null default 'open' check (status in ('open','pending','closed')),
  last_inbound_at timestamptz,
  activity_at timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, phone_number_id, contact_id),
  unique (org_id, id, phone_number_id),
  foreign key (org_id, phone_number_id) references public.whatsapp_channels on delete cascade,
  foreign key (org_id, contact_id) references public.contacts on delete cascade,
  foreign key (org_id, assignee_id) references public.memberships on delete set null (assignee_id)
);
create index whatsapp_inbox_idx on public.whatsapp_conversations (org_id, activity_at desc, id);
create table public.whatsapp_messages (
  org_id uuid not null,
  phone_number_id text not null,
  message_id text not null check (char_length(message_id) between 1 and 512),
  conversation_id uuid not null,
  direction text not null check (direction in ('in','out')),
  body text not null check (char_length(body) <= 4096),
  occurred_at timestamptz not null,
  primary key (org_id, phone_number_id, message_id),
  foreign key (org_id, conversation_id, phone_number_id)
    references public.whatsapp_conversations (org_id, id, phone_number_id) on delete cascade
);
create index whatsapp_thread_idx on public.whatsapp_messages (org_id, conversation_id, occurred_at desc, message_id);
create table public.whatsapp_receipts (
  org_id uuid not null,
  phone_number_id text not null,
  message_id text not null check (char_length(message_id) between 1 and 512),
  status text not null check (status in ('sent','delivered','read','failed')),
  occurred_at timestamptz not null,
  primary key (org_id, phone_number_id, message_id),
  foreign key (org_id, phone_number_id) references public.whatsapp_channels on delete cascade
);
create table public.whatsapp_notes (
  org_id uuid not null,
  id uuid not null default gen_random_uuid(),
  conversation_id uuid not null,
  author_id uuid not null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, conversation_id) references public.whatsapp_conversations on delete cascade
);
create index whatsapp_notes_thread_idx on public.whatsapp_notes (org_id, conversation_id, created_at desc);
alter table public.deals add column conversation_id uuid,
  add constraint deal_conversation_same_org foreign key (org_id, conversation_id)
    references public.whatsapp_conversations on delete set null (conversation_id);
grant update (conversation_id) on public.deals to authenticated;

do $$
declare relation text;
begin
  foreach relation in array array['whatsapp_channels','whatsapp_consent','whatsapp_conversations','whatsapp_messages','whatsapp_receipts','whatsapp_notes'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('revoke all on public.%I from public,anon,authenticated',relation);
    execute format('grant all on public.%I to service_role',relation);
    if relation <> 'whatsapp_channels' then
      execute format('grant select on public.%I to authenticated',relation);
      execute format('create policy member_read on public.%I for select to authenticated using (private.member_role(org_id) is not null)',relation);
    end if;
  end loop;
end $$;

grant update (assignee_id,status) on public.whatsapp_conversations to authenticated;
create policy writer_conversation on public.whatsapp_conversations for update to authenticated
  using (private.member_role(org_id) in ('owner','admin','agent'))
  with check (private.member_role(org_id) in ('owner','admin','agent'));
grant insert (org_id,conversation_id,body) on public.whatsapp_notes to authenticated;
create policy writer_note on public.whatsapp_notes for insert to authenticated
  with check (private.member_role(org_id) in ('owner','admin','agent') and author_id = (select auth.uid()));

create function public.record_whatsapp_consent(p_org uuid,p_contact uuid,p_opted_in boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(private.member_role(p_org) not in ('owner','admin','agent'),true) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  insert into public.whatsapp_consent values (p_org,p_contact,p_opted_in,'recorded',clock_timestamp())
  on conflict (org_id,contact_id) do update set opted_in=excluded.opted_in,source=excluded.source,changed_at=excluded.changed_at;
end $$;
revoke all on function public.record_whatsapp_consent(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.record_whatsapp_consent(uuid,uuid,boolean) to authenticated;

-- Bootstrap routing by globally unique registered phone ID. All subsequent work
-- receives this org explicitly and checks the pair again in the transaction.
create function public.whatsapp_route(p_number text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select org_id from public.whatsapp_channels where phone_number_id=p_number;
$$;

create function public.ingest_whatsapp(p_org uuid,p_number text,p_events jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  event jsonb;
  contact uuid;
  thread uuid;
  event_time timestamptz;
  phone text;
  content text;
begin
  if not exists(select 1 from public.whatsapp_channels where org_id=p_org and phone_number_id=p_number) then
    raise exception 'Unknown WhatsApp channel' using errcode = '42501';
  end if;
  for event in select value from jsonb_array_elements(p_events) loop
    event_time := least(to_timestamp((event->>'timestamp')::bigint),clock_timestamp());
    if event->>'kind' = 'status' then
      insert into public.whatsapp_receipts values (p_org,p_number,event->>'id',event->>'status',event_time)
      on conflict (org_id,phone_number_id,message_id) do update
      set status=excluded.status,occurred_at=excluded.occurred_at
      where case excluded.status when 'sent' then 1 when 'failed' then 2 when 'delivered' then 3 when 'read' then 4 end
        > case whatsapp_receipts.status when 'sent' then 1 when 'failed' then 2 when 'delivered' then 3 when 'read' then 4 end;
      continue;
    end if;
    if exists(select 1 from public.whatsapp_messages where org_id=p_org and phone_number_id=p_number and message_id=event->>'id') then
      continue;
    end if;
    phone := '+' || (event->>'from');
    content := event->>'body';
    insert into public.contacts(org_id,name,phone_e164) values (p_org,phone,phone)
      on conflict (org_id,phone_e164) do nothing;
    select id into strict contact from public.contacts where org_id=p_org and phone_e164=phone;
    insert into public.whatsapp_conversations(org_id,phone_number_id,contact_id,activity_at)
      values (p_org,p_number,contact,event_time) on conflict (org_id,phone_number_id,contact_id) do nothing;
    select id into strict thread from public.whatsapp_conversations
      where org_id=p_org and phone_number_id=p_number and contact_id=contact;
    insert into public.whatsapp_messages values (p_org,p_number,event->>'id',thread,'in',content,event_time)
      on conflict (org_id,phone_number_id,message_id) do nothing;
    if not found then continue; end if;
    update public.whatsapp_conversations set
      last_inbound_at=greatest(last_inbound_at,event_time),activity_at=greatest(activity_at,event_time)
      where org_id=p_org and id=thread and phone_number_id=p_number;
    if upper(btrim(content, E' \t\r\n'))='STOP' then
      insert into public.whatsapp_consent values (p_org,contact,false,'stop',event_time)
        on conflict (org_id,contact_id) do update set opted_in=false,source='stop',changed_at=excluded.changed_at
        where whatsapp_consent.changed_at <= excluded.changed_at;
    end if;
  end loop;
end $$;

revoke all on function public.whatsapp_route(text), public.ingest_whatsapp(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.whatsapp_route(text), public.ingest_whatsapp(uuid,text,jsonb) to service_role;

create function public.store_outbound_whatsapp(p_org uuid,p_number text,p_thread uuid,p_id text,p_body text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.whatsapp_messages values (p_org,p_number,p_id,p_thread,'out',p_body,clock_timestamp())
  on conflict (org_id,phone_number_id,message_id) do nothing;
  if found then
    update public.whatsapp_conversations set activity_at=greatest(activity_at,clock_timestamp())
      where org_id=p_org and id=p_thread and phone_number_id=p_number;
  end if;
end $$;
revoke all on function public.store_outbound_whatsapp(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.store_outbound_whatsapp(uuid,text,uuid,text,text) to service_role;
grant select, insert on public.contacts to service_role;
