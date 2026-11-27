create table public.contacts (
  org_id uuid not null references public.organizations on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone_e164 text not null check (phone_e164 ~ '^[+][1-9][0-9]{1,14}$'),
  kind text not null default 'contact' check (kind in ('contact', 'lead')),
  created_at timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, phone_e164)
);
create index contacts_list_idx on public.contacts (org_id, created_at desc, id desc);

create table public.contact_tags (
  org_id uuid not null references public.organizations on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 48),
  normalized_name text generated always as (lower(name)) stored,
  primary key (org_id, id),
  unique (org_id, normalized_name)
);

create table public.contact_tag_links (
  org_id uuid not null,
  contact_id uuid not null,
  tag_id uuid not null,
  primary key (org_id, contact_id, tag_id),
  foreign key (org_id, contact_id) references public.contacts on delete cascade,
  foreign key (org_id, tag_id) references public.contact_tags on delete cascade
);
create index contact_tag_links_tag_idx on public.contact_tag_links (org_id, tag_id);

create table public.contact_fields (
  org_id uuid not null references public.organizations on delete cascade,
  slot smallint not null check (slot between 1 and 20),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 48),
  normalized_name text generated always as (lower(name)) stored,
  kind text not null check (kind in ('text', 'number', 'boolean', 'date')),
  primary key (org_id, slot),
  unique (org_id, normalized_name),
  unique (org_id, slot, kind)
);

create table public.contact_field_values (
  org_id uuid not null,
  contact_id uuid not null,
  field_slot smallint not null,
  field_kind text not null,
  value jsonb not null,
  primary key (org_id, contact_id, field_slot),
  foreign key (org_id, contact_id) references public.contacts on delete cascade,
  foreign key (org_id, field_slot, field_kind) references public.contact_fields (org_id, slot, kind) on delete cascade,
  check (case field_kind
    when 'text' then jsonb_typeof(value) = 'string' and char_length(value #>> '{}') between 1 and 500
    when 'number' then jsonb_typeof(value) = 'number' and abs((value #>> '{}')::numeric) <= 1000000000000
    when 'boolean' then jsonb_typeof(value) = 'boolean'
    when 'date' then jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and (value #>> '{}')::date between date '0001-01-01' and date '9999-12-31'
    else false end)
);
create index contact_field_values_field_idx on public.contact_field_values (org_id, field_slot);

do $$
declare
  relation text;
begin
  foreach relation in array array['contacts','contact_tags','contact_tag_links','contact_fields','contact_field_values'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from public, anon, authenticated', relation);
    execute format('grant select, insert, delete on public.%I to authenticated', relation);
    execute format('create policy tenant_read on public.%I for select to authenticated
      using (private.member_role(org_id) is not null)', relation);
    execute format('create policy tenant_write on public.%I for all to authenticated
      using (private.member_role(org_id) in (''owner'',''admin'',''agent''))
      with check (private.member_role(org_id) in (''owner'',''admin'',''agent''))', relation);
  end loop;
end;
$$;

-- Tenant identifiers and composite key columns cannot be updated by API users.
grant update (name, phone_e164, kind) on public.contacts to authenticated;
grant update (name) on public.contact_tags, public.contact_fields to authenticated;
grant update (value) on public.contact_field_values to authenticated;

create function public.create_contact_field(p_org uuid, p_name text, p_kind text)
returns smallint language plpgsql security invoker set search_path = '' as $$
declare
  available smallint;
begin
  if coalesce(private.member_role(p_org) not in ('owner','admin','agent'), true) then
    raise exception 'Contact field creation is forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('contact-field:' || p_org::text, 0));
  select i::smallint into available from generate_series(1,20) as slots(i)
  where not exists (select 1 from public.contact_fields where org_id = p_org and slot = i)
  order by i limit 1;
  if available is null then raise exception 'Custom field limit reached' using errcode = '23514'; end if;
  insert into public.contact_fields(org_id, slot, name, kind) values (p_org, available, btrim(p_name), p_kind);
  return available;
end;
$$;

create function public.import_contacts(p_org uuid, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  inserted integer;
begin
  if coalesce(private.member_role(p_org) not in ('owner','admin','agent'), true) then
    raise exception 'Contact import is forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Invalid contact batch' using errcode = '22023';
  end if;
  insert into public.contacts(org_id, name, phone_e164, kind)
    select p_org, item.name, item.phone_e164, item.kind
    from jsonb_to_recordset(p_rows) as item(name text, phone_e164 text, kind text)
    on conflict (org_id, phone_e164) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
revoke all on function public.create_contact_field(uuid,text,text), public.import_contacts(uuid,jsonb) from public, anon;
grant execute on function public.create_contact_field(uuid,text,text), public.import_contacts(uuid,jsonb) to authenticated;
