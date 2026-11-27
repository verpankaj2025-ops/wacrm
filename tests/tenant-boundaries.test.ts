import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, test, vi } from 'vitest';
import { organizationBroadcastChannel, organizationFilePath, organizationTopic } from '../lib/tenant';

const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const agentA = '00000000-0000-4000-8000-000000000001';
const viewerA = '00000000-0000-4000-8000-000000000002';
const ownerB = '00000000-0000-4000-8000-000000000003';

test('tenant helpers construct canonical file paths and Realtime topics', () => {
  expect(organizationTopic(orgA.toUpperCase())).toBe('org:' + orgA);
  expect(organizationFilePath(orgB, 'documents', 'receipt.pdf')).toBe(orgB + '/documents/receipt.pdf');
  for (const segment of ['', '..', '.', 'a/b', 'a\\b', '%2e%2e']) {
    expect(() => organizationFilePath(orgA, segment)).toThrow();
  }
  expect(() => organizationTopic('another-organization')).toThrow();
});

test('organization Broadcast channels always join in private mode', () => {
  const client = { channel: vi.fn() };
  organizationBroadcastChannel(client, orgA);
  expect(client.channel).toHaveBeenCalledWith('org:' + orgA, { config: { private: true } });
});

test('organizations A and B are isolated in tables, Storage paths and Realtime topics', async () => {
  const db = new PGlite();
  try {
    // Provider-owned relations and session functions for SQL policy checks.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage; create schema realtime;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.buckets(id text primary key, name text, public boolean);
      create table storage.objects(bucket_id text references storage.buckets, name text, primary key(bucket_id,name));
      create table realtime.messages(topic text, extension text);
      create function realtime.topic() returns text language sql stable as
        $$ select nullif(current_setting('realtime.topic', true), '') $$;
      alter table storage.objects enable row level security;
      alter table realtime.messages enable row level security;
      grant usage on schema storage, realtime to authenticated, anon;
      grant select, insert, update, delete on storage.objects to authenticated, anon;
      grant select, insert on realtime.messages to authenticated, anon;
      create policy broad_storage on storage.objects for all to authenticated, anon using (true) with check (true);
    `);
    for (const name of ['202611270001_organizations.sql', '202611270002_tenant_boundaries.sql']) {
      await db.exec(readFileSync('supabase/migrations/' + name, 'utf8'));
    }

    await db.query('insert into public.organizations(org_id,name) values ($1,$3),($2,$4)', [orgA, orgB, 'Org A', 'Org B']);
    await db.query("insert into auth.users values ($1,'a@example.com',now()),($2,'v@example.com',now()),($3,'b@example.com',now())",
      [agentA, viewerA, ownerB]);
    await db.query("insert into public.memberships(org_id,user_id,role) values ($1,$3,'agent'),($1,$4,'viewer'),($2,$5,'owner')",
      [orgA, orgB, agentA, viewerA, ownerB]);
    const inviteB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await db.query("insert into public.invitations(org_id,id,email,role,token_hash) values ($1,$2,'new@example.com','agent',$3)",
      [orgB, inviteB, 'a'.repeat(64)]);
    const audit = (org: string) => db.query("insert into public.audit_log(org_id,actor_id,event,subject_id) values ($1,$2,'invite.created',$3)",
      [org, ownerB, inviteB]);
    await expect(audit(orgA)).rejects.toMatchObject({ code: '23503' });
    await audit(orgB);

    const fileA = organizationFilePath(orgA, 'a.txt');
    const fileB = organizationFilePath(orgB, 'b.txt');
    const topicA = organizationTopic(orgA);
    const topicB = organizationTopic(orgB);
    const upload = (name: string) => db.query("insert into storage.objects values ('organization-files',$1)", [name]);
    const files = () => db.query<{ name: string }>('select name from storage.objects order by name');
    const messages = () => db.query<{ topic: string }>('select topic from realtime.messages');
    await upload(fileA);
    await upload(fileB);
    await db.query("insert into realtime.messages values ($1,'broadcast'),($2,'broadcast'),($1,'presence')", [topicA, topicB]);
    expect((await db.query("select public from storage.buckets where id='organization-files'")).rows)
      .toEqual([{ public: false }]);

    async function actor(id: string, topic: string, role: 'anon' | 'authenticated' = 'authenticated') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('realtime.topic',$2,false)", [id,topic]);
      await db.exec('set role ' + role);
    }

    await actor(agentA, topicA);
    expect((await db.query('select org_id from public.organizations')).rows).toEqual([{ org_id: orgA }]);
    expect((await db.query('select * from public.audit_log')).rows).toEqual([]);
    await expect(db.query("select public.change_membership($1,$2,'viewer')", [orgB, ownerB]))
      .rejects.toMatchObject({ code: '42501' });
    expect((await files()).rows).toEqual([{ name: fileA }]);
    const uploadA = organizationFilePath(orgA, 'new.txt');
    await upload(uploadA);
    for (const path of [orgB + '/foreign.txt', orgA + '/../escape.txt', orgA + '//empty.txt', 'not-a-uuid/file']) {
      await expect(upload(path)).rejects.toMatchObject({ code: '42501' });
    }
    await expect(db.query('update storage.objects set name=$1 where name=$2', [orgB + '/new.txt', uploadA]))
      .rejects.toMatchObject({ code: '42501' });
    expect((await db.query('delete from storage.objects where name=$1 returning name', [fileB])).rows).toEqual([]);
    expect((await messages()).rows).toEqual([{ topic: topicA }]);
    await actor(agentA, topicB);
    expect((await messages()).rows).toEqual([]);

    await db.exec(`
      reset role;
      create policy broad_realtime_read on realtime.messages for select to authenticated, anon using (true);
      create policy broad_realtime_send on realtime.messages for insert to authenticated, anon with check (true);
    `);
    await actor(agentA, topicB);
    expect((await messages()).rows).toEqual([]);
    await actor(agentA, topicA);
    await expect(db.query("insert into realtime.messages values ($1,'broadcast')", [topicA]))
      .rejects.toMatchObject({ code: '42501' });

    await actor(viewerA, topicA);
    expect((await files()).rows).toEqual([{ name: fileA }, { name: uploadA }]);
    await expect(upload(orgA + '/denied.txt')).rejects.toMatchObject({ code: '42501' });
    expect((await messages()).rows).toEqual([{ topic: topicA }]);
    await actor(ownerB, topicB);
    expect((await db.query('select org_id from public.organizations')).rows).toEqual([{ org_id: orgB }]);
    expect((await files()).rows).toEqual([{ name: fileB }]);
    expect((await messages()).rows).toEqual([{ topic: topicB }]);
    await actor('', topicA, 'anon');
    expect((await files()).rows).toEqual([]);
    expect((await messages()).rows).toEqual([]);
  } finally {
    await db.close();
  }
}, 30000);
