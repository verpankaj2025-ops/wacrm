import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

async function migratedDatabase() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    await db.exec(readFileSync('supabase/migrations/202611270001_organizations.sql', 'utf8'));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

test('tenant policies, invite lifecycle, role enforcement and audit', async () => {
  const db = await migratedDatabase();
  try {
    const owner = '00000000-0000-4000-8000-000000000001';
    const guest = '00000000-0000-4000-8000-000000000002';
    const stranger = '00000000-0000-4000-8000-000000000003';
    const hash = 'a'.repeat(64);
    await db.query('insert into auth.users values ($1, $4, now()), ($2, $5, now()), ($3, $6, now())',
      [owner, guest, stranger, 'owner@example.com', 'guest@example.com', 'stranger@example.com']);
    async function actor(id: string, role = 'authenticated') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      await db.exec('set role ' + role);
    }
    await actor(owner, 'anon');
    await expect(db.query("select public.create_organization('Blocked')")).rejects.toMatchObject({ code: '42501' });
    await actor(owner);
    const { rows: [{ org }] } = await db.query<{ org: string }>("select public.create_organization('Relaxio Test') as org");
    await expect(db.query("select public.change_membership($1,$2,'agent')", [org, owner])).rejects.toMatchObject({ code: '23514' });
    await expect(db.query("select public.change_membership($1,$2,null)", [org, owner])).rejects.toMatchObject({ code: '23514' });
    await db.query("select public.create_invitation($1,'Guest@example.com','agent',$2)", [org, hash]);
    await expect(db.query('select token_hash from public.invitations')).rejects.toMatchObject({ code: '42501' });
    await actor(guest);
    const { rows: [{ org: guestOrg }] } = await db.query<{ org: string }>(
      "select public.create_organization('Separate organization') as org");
    expect((await db.query('select org_id from public.organizations')).rows).toEqual([{ org_id: guestOrg }]);
    await expect(db.query("update public.organizations set name = 'Changed' where org_id = $1", [org]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query("select public.change_membership($1,$2,'viewer')", [org, owner]))
      .rejects.toMatchObject({ code: '42501' });
    expect((await db.query('select * from public.organization_roster($1)', [org])).rows).toEqual([]);
    await expect(db.query('select public.accept_invitation($1,$2)', [guest, hash])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query("select public.create_invitation($1,'guest@example.com','admin',$2)", [org, hash])).rejects.toMatchObject({ code: '42501' });
    await actor(guest, 'service_role');
    const redeem = (id: string) => db.query<{ org: string | null }>('select public.accept_invitation($1,$2) as org', [id, hash]);
    expect((await redeem(stranger)).rows[0].org).toBeNull();
    expect((await redeem(guest)).rows[0].org).toBe(org);
    expect((await redeem(guest)).rows[0].org).toBeNull();
    await actor(guest);
    expect((await db.query('select role from public.memberships where user_id=$1 and org_id=$2', [guest, org])).rows).toEqual([{ role: 'agent' }]);
    expect((await db.query('select * from public.audit_log where org_id = $1', [org])).rows).toEqual([]);
    await expect(db.query("update public.memberships set role='owner'")).rejects.toMatchObject({ code: '42501' });
    await actor(owner);
    await db.query("select public.change_membership($1,$2,'viewer')", [org, guest]);
    await db.query('select public.change_membership($1,$2,null)', [org, guest]);
    expect((await db.query<{ event: string }>('select event from public.audit_log order by id')).rows.map(row => row.event))
      .toEqual(['membership.added', 'invite.created', 'membership.added', 'invite.accepted', 'role.changed', 'membership.removed']);
    await actor(guest);
    expect((await db.query('select * from public.memberships where org_id = $1', [org])).rows).toEqual([]);
    expect((await db.query('select * from public.organizations where org_id = $1', [org])).rows).toEqual([]);
    await expect(db.query("select public.create_invitation($1,'guest@example.com','viewer',$2)", [org, hash]))
      .rejects.toMatchObject({ code: '42501' });

    await actor(owner);
    const { rows: [revoked] } = await db.query<{ id: string }>(
      "select public.create_invitation($1, 'guest@example.com', 'viewer', $2) as id", [org, 'b'.repeat(64)]);
    await db.query('select public.revoke_invitation($1,$2)', [org, revoked.id]);
    await db.query("select public.create_invitation($1, 'stranger@example.com', 'admin', $2)", [org, 'c'.repeat(64)]);
    await actor(guest, 'service_role');
    expect((await db.query('select public.accept_invitation($1,$2)', [guest, 'b'.repeat(64)])).rows)
      .toEqual([{ accept_invitation: null }]);
    expect((await db.query('select public.accept_invitation($1,$2)', [stranger, 'c'.repeat(64)])).rows)
      .toEqual([{ accept_invitation: org }]);
    await actor(stranger);
    await expect(db.query("select public.change_membership($1,$2,'viewer')", [org, owner]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query("select public.create_invitation($1,'guest@example.com','admin',$2)", [org, hash]))
      .rejects.toMatchObject({ code: '42501' });
  } finally {
    await db.close();
  }
}, 30000);

test('RLS is enabled on every public table', async () => {
  const db = await migratedDatabase();
  try {
    const { rows } = await db.query<{ table_name: string; rls_enabled: boolean }>(`
      select c.relname as table_name, c.relrowsecurity as rls_enabled
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname
    `);
    console.table(rows);
    expect(rows.map(row => row.table_name)).toEqual(expect.arrayContaining(
      ['audit_log', 'invitations', 'memberships', 'organizations'],
    ));
    expect(rows.filter(row => !row.rls_enabled)).toEqual([]);
  } finally {
    await db.close();
  }
}, 30000);
