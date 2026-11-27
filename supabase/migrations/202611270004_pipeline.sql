create table public.pipeline_stages (
  org_id uuid not null references public.organizations on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  normalized_name text generated always as (lower(name)) stored,
  position integer not null default 100 check (position between 1 and 10000),
  primary key (org_id, id),
  unique (org_id, normalized_name)
);
create index pipeline_stages_order_idx on public.pipeline_stages (org_id, position, name, id);

create table public.deals (
  org_id uuid not null references public.organizations on delete cascade,
  id uuid not null default gen_random_uuid(),
  contact_id uuid not null,
  stage_id uuid not null,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 120),
  amount_inr numeric(12,2) not null default 0 check (amount_inr >= 0 and amount_inr <> 'NaN'::numeric),
  created_at timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, contact_id) references public.contacts (org_id, id) on delete no action deferrable initially deferred,
  foreign key (org_id, stage_id) references public.pipeline_stages (org_id, id) on delete no action deferrable initially deferred
);
create index deals_by_stage_idx on public.deals (org_id, stage_id, created_at desc, id desc);
create index deals_by_contact_idx on public.deals (org_id, contact_id);

alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
revoke all on public.pipeline_stages, public.deals from public, anon, authenticated;

grant select on public.pipeline_stages, public.deals to authenticated;
grant insert (org_id, name, position) on public.pipeline_stages to authenticated;
grant insert (org_id, contact_id, stage_id, title, amount_inr) on public.deals to authenticated;
grant update (stage_id) on public.deals to authenticated;

create policy stage_member_read on public.pipeline_stages for select to authenticated
  using (private.member_role(org_id) is not null);
create policy stage_writer_create on public.pipeline_stages for insert to authenticated
  with check (private.member_role(org_id) in ('owner','admin','agent'));
create policy deal_member_read on public.deals for select to authenticated
  using (private.member_role(org_id) is not null);
create policy deal_writer_create on public.deals for insert to authenticated
  with check (private.member_role(org_id) in ('owner','admin','agent'));
create policy deal_writer_move on public.deals for update to authenticated
  using (private.member_role(org_id) in ('owner','admin','agent'))
  with check (private.member_role(org_id) in ('owner','admin','agent'));

create function public.move_deal(p_org uuid, p_deal uuid, p_from uuid, p_to uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(private.member_role(p_org) not in ('owner','admin','agent'), true) then
    raise exception 'Deal move is forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'Choose a different stage' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pipeline_stages where org_id = p_org and id = p_to) then
    raise exception 'Stage does not belong to this pipeline' using errcode = '23503';
  end if;
  update public.deals set stage_id = p_to where org_id = p_org and id = p_deal and stage_id = p_from;
  return found;
end;
$$;
revoke all on function public.move_deal(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.move_deal(uuid,uuid,uuid,uuid) to authenticated;
