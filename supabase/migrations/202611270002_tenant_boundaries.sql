-- Preserve the polymorphic audit subject while enforcing the invitation tenant.
alter table public.audit_log
  add column invitation_id uuid generated always as (
    case when event in ('invite.created', 'invite.revoked', 'invite.accepted') then subject_id end
  ) stored,
  add constraint audit_invitation_same_org foreign key (org_id, invitation_id)
    references public.invitations (org_id, id) deferrable initially deferred;
create index audit_invitation_idx on public.audit_log (org_id, invitation_id)
  where invitation_id is not null;

-- Validate the entire name before casting. Keep the UUID namespace canonical.
create function private.storage_org(p_name text)
returns uuid language sql immutable strict set search_path = '' as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+(/[^/]+)*$'
    and p_name !~ '(^|/)[.]{1,2}(/|$)'
    and position(chr(92) in p_name) = 0
    then split_part(p_name, '/', 1)::uuid end;
$$;
create function private.realtime_org(p_topic text)
returns uuid language sql immutable strict set search_path = '' as $$
  select case when p_topic ~ '^org:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substring(p_topic from 5)::uuid end;
$$;
revoke all on function private.storage_org(text), private.realtime_org(text) from public, anon;
grant execute on function private.storage_org(text), private.realtime_org(text) to authenticated;

insert into storage.buckets (id, name, public)
values ('organization-files', 'organization-files', false);

-- Restrictive guards keep a broad policy from another feature from widening
-- this bucket. Policies for other buckets continue to apply independently.
create policy organization_files_read_guard on storage.objects
  as restrictive for select to authenticated
  using (bucket_id <> 'organization-files' or private.member_role(private.storage_org(name)) is not null);

create policy organization_files_insert_guard on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'organization-files' or
    coalesce(private.member_role(private.storage_org(name)) in ('owner','admin','agent'), false));

create policy organization_files_update_guard on storage.objects
  as restrictive for update to authenticated
  using (bucket_id <> 'organization-files' or
    coalesce(private.member_role(private.storage_org(name)) in ('owner','admin','agent'), false))
  with check (bucket_id <> 'organization-files' or
    coalesce(private.member_role(private.storage_org(name)) in ('owner','admin','agent'), false));

create policy organization_files_delete_guard on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'organization-files' or
    coalesce(private.member_role(private.storage_org(name)) in ('owner','admin','agent'), false));

create policy organization_files_no_anon on storage.objects
  as restrictive for all to anon
  using (bucket_id <> 'organization-files')
  with check (bucket_id <> 'organization-files');

create policy organization_files_select on storage.objects for select to authenticated
  using (bucket_id = 'organization-files');
create policy organization_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'organization-files');
create policy organization_files_update on storage.objects for update to authenticated
  using (bucket_id = 'organization-files') with check (bucket_id = 'organization-files');
create policy organization_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'organization-files');

-- Organization topics are private, receive-only Broadcast channels. Use
-- realtime.topic(), the channel being authorized, for the membership check.
create policy organization_realtime_receive on realtime.messages for select to authenticated
  using (extension = 'broadcast' and (topic is null or topic = realtime.topic()) and private.member_role(private.realtime_org(realtime.topic())) is not null);
create policy organization_realtime_read_guard on realtime.messages
  as restrictive for select to authenticated
  using (coalesce(realtime.topic(), '') not like 'org:%' and coalesce(topic, '') not like 'org:%' or
    (extension = 'broadcast' and (topic is null or topic = realtime.topic()) and private.member_role(private.realtime_org(realtime.topic())) is not null));
create policy organization_realtime_no_client_send on realtime.messages
  as restrictive for insert to anon, authenticated
  with check (coalesce(realtime.topic(), '') not like 'org:%' and coalesce(topic, '') not like 'org:%');
create policy organization_realtime_no_anon_read on realtime.messages
  as restrictive for select to anon
  using (coalesce(realtime.topic(), '') not like 'org:%' and coalesce(topic, '') not like 'org:%');
