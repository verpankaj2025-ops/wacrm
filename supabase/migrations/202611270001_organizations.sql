create schema if not exists private;
create type public.org_role as enum ('owner', 'admin', 'agent', 'viewer');

create table public.organizations (
  org_id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  created_at timestamptz not null default now()
);
create table public.memberships (
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users,
  role public.org_role not null,
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);
create table public.invitations (
  org_id uuid not null references public.organizations on delete cascade,
  id uuid not null default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 254),
  role public.org_role not null check (role <> 'owner'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  primary key (org_id, id)
);
create table public.audit_log (
  org_id uuid not null references public.organizations on delete cascade,
  id bigint generated always as identity,
  actor_id uuid not null,
  event text not null,
  subject_id uuid not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);

create function private.member_role(p_org uuid)
returns public.org_role language sql stable security definer set search_path = '' as $$
  select role from public.memberships where org_id = p_org and user_id = (select auth.uid());
$$;
revoke all on function private.member_role(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.member_role(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.organizations, public.memberships, public.invitations, public.audit_log from public, anon, authenticated;
grant select on public.organizations, public.memberships, public.audit_log to authenticated;
grant select (org_id, id, email, role, expires_at, accepted_at, revoked_at) on public.invitations to authenticated;

create policy org_member_read on public.organizations for select to authenticated
  using (private.member_role(org_id) is not null);
create policy membership_read on public.memberships for select to authenticated
  using (private.member_role(org_id) is not null);
create policy invitation_manager_read on public.invitations for select to authenticated
  using (private.member_role(org_id) in ('owner', 'admin'));
create policy audit_manager_read on public.audit_log for select to authenticated
  using (private.member_role(org_id) in ('owner', 'admin'));

create function private.lock_org(p_org uuid)
returns void language sql set search_path = '' as $$
  select from public.organizations where org_id = p_org for update;
$$;
revoke all on function private.lock_org(uuid) from public, anon, authenticated;

create function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  new_org uuid;
begin
  if not exists(select 1 from auth.users where id = actor and email_confirmed_at is not null) then
    raise exception 'Verified email required' using errcode = '42501';
  end if;
  insert into public.organizations(name) values (btrim(p_name)) returning org_id into new_org;
  insert into public.memberships(org_id, user_id, role) values (new_org, actor, 'owner');
  insert into public.audit_log(org_id, actor_id, event, subject_id, details)
    values (new_org, actor, 'membership.added', actor, '{"role":"owner"}');
  return new_org;
end;
$$;

create function public.create_invitation(p_org uuid, p_email text, p_role public.org_role, p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.org_role;
  invite_id uuid;
begin
  perform private.lock_org(p_org);
  actor_role := private.member_role(p_org);
  if actor_role is null or actor_role not in ('owner', 'admin') or p_role is null
     or p_role = 'owner' or (actor_role = 'admin' and p_role = 'admin') then
    raise exception 'Invitation not permitted' using errcode = '42501';
  end if;
  insert into public.invitations(org_id, email, role, token_hash)
    values (p_org, lower(btrim(p_email)), p_role, p_hash) returning id into invite_id;
  insert into public.audit_log(org_id, actor_id, event, subject_id, details)
    values (p_org, auth.uid(), 'invite.created', invite_id, jsonb_build_object('role', p_role));
  return invite_id;
end;
$$;

create function public.revoke_invitation(p_org uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.org_role;
begin
  perform private.lock_org(p_org);
  actor_role := private.member_role(p_org);
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Invitation not permitted' using errcode = '42501';
  end if;
  update public.invitations set revoked_at = now()
    where org_id = p_org and id = p_id and accepted_at is null and revoked_at is null
      and (actor_role = 'owner' or role <> 'admin');
  if found then
    insert into public.audit_log(org_id, actor_id, event, subject_id)
      values (p_org, auth.uid(), 'invite.revoked', p_id);
  end if;
end;
$$;

-- Only the application service may redeem, after authenticating and rate-limiting the caller.
create function public.accept_invitation(p_actor uuid, p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  invite public.invitations%rowtype;
  verified_email text;
begin
  select lower(email) into verified_email from auth.users
    where id = p_actor and email_confirmed_at is not null;
  select * into invite from public.invitations where token_hash = p_hash;
  if not found or verified_email is null or invite.email <> verified_email then
    return null;
  end if;
  perform private.lock_org(invite.org_id);
  update public.invitations set accepted_at = now()
    where org_id = invite.org_id and id = invite.id and accepted_at is null
      and revoked_at is null and expires_at > clock_timestamp();
  if not found then return null; end if;
  insert into public.memberships(org_id, user_id, role)
    values (invite.org_id, p_actor, invite.role) on conflict do nothing;
  if found then
    insert into public.audit_log(org_id, actor_id, event, subject_id, details)
      values (invite.org_id, p_actor, 'membership.added', p_actor, jsonb_build_object('role', invite.role));
  end if;
  insert into public.audit_log(org_id, actor_id, event, subject_id)
    values (invite.org_id, p_actor, 'invite.accepted', invite.id);
  return invite.org_id;
end;
$$;

create function public.change_membership(p_org uuid, p_user uuid, p_role public.org_role)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.org_role;
  old_role public.org_role;
begin
  perform private.lock_org(p_org);
  actor_role := private.member_role(p_org);
  select role into old_role from public.memberships where org_id = p_org and user_id = p_user;
  if old_role is null or actor_role is null or actor_role not in ('owner', 'admin')
     or (actor_role = 'admin' and (old_role in ('owner', 'admin') or p_role in ('owner', 'admin'))) then
    raise exception 'Membership change not permitted' using errcode = '42501';
  end if;
  if old_role = p_role then return; end if;
  if old_role = 'owner' and not exists(
    select 1 from public.memberships where org_id = p_org and user_id <> p_user and role = 'owner'
  ) then
    raise exception 'At least one owner is required' using errcode = '23514';
  end if;
  if p_role is null then
    delete from public.memberships where org_id = p_org and user_id = p_user;
  else
    update public.memberships set role = p_role where org_id = p_org and user_id = p_user;
  end if;
  insert into public.audit_log(org_id, actor_id, event, subject_id, details)
    values (p_org, auth.uid(), case when p_role is null then 'membership.removed' else 'role.changed' end,
            p_user, jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;

revoke all on function public.create_organization(text), public.create_invitation(uuid,text,public.org_role,text),
  public.revoke_invitation(uuid,uuid), public.change_membership(uuid,uuid,public.org_role)
  from public, anon, authenticated, service_role;
grant execute on function public.create_organization(text), public.create_invitation(uuid,text,public.org_role,text),
  public.revoke_invitation(uuid,uuid), public.change_membership(uuid,uuid,public.org_role) to authenticated;
revoke all on function public.accept_invitation(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.accept_invitation(uuid,text) to service_role;

create function public.organization_roster(p_org uuid)
returns table(user_id uuid, role public.org_role, email text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role, u.email::text
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.org_id = p_org and private.member_role(p_org) is not null
  order by m.joined_at, m.user_id;
$$;
revoke all on function public.organization_roster(uuid) from public, anon, authenticated, service_role;
grant execute on function public.organization_roster(uuid) to authenticated;
