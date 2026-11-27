import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

test('contact RLS permits owner, admin and agent writes, gives viewers read-only access and isolates organizations A and B', async () => {
  const db = new PGlite();
  const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const contact = 'aaaaaaaa-0000-4000-8000-000000000001';
  const tagB = 'bbbbbbbb-0000-4000-8000-000000000001';
  const roles = ['owner', 'admin', 'agent', 'viewer'] as const;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    for (const migration of ['202611270001_organizations.sql', '202611270003_contacts.sql']) {
      await db.exec(readFileSync('supabase/migrations/' + migration, 'utf8'));
    }
    await db.query("insert into public.organizations (org_id,name) values ($1,'Org A'),($2,'Org B')", [a,b]);
    await db.query("insert into public.contacts (org_id,id,name,phone_e164) values ($1,$3,'A','+919876543210'),($2,$3,'B','+919876543210')", [a,b,contact]);
    await db.query("insert into public.contact_tags (org_id,id,name) values ($1,$2,'Priority')", [b,tagB]);
    await db.query("insert into public.contact_fields (org_id,slot,name,kind) values ($1,1,'Score','number')", [b]);
    for (const [i, role] of roles.entries()) {
      const actor = '00000000-0000-4000-8000-00000000000' + (i + 1);
      await db.exec('reset role');
      await db.query('insert into auth.users(id) values ($1)', [actor]);
      await db.query('insert into public.memberships(org_id,user_id,role) values ($1,$2,$3)', [a,actor,role]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      await db.exec('set role authenticated');
      expect((await db.query('select name from public.contacts')).rows).toEqual([{ name: 'A' }]);
      const written = db.query("insert into public.contact_tags (org_id,name) values ($1,$2)", [a,role]);
      if (role === 'viewer') {
        await expect(written).rejects.toMatchObject({ code: '42501' });
        expect((await db.query("update public.contacts set kind='lead' returning id")).rows).toEqual([]);
        expect((await db.query('delete from public.contacts returning id')).rows).toEqual([]);
        await expect(db.query("select public.import_contacts($1,'[]')", [a])).rejects.toMatchObject({ code: '42501' });
        continue;
      }
      await written;
      expect((await db.query("update public.contacts set kind='lead' where org_id=$1 returning id", [a])).rows).toHaveLength(1);
      expect((await db.query("update public.contacts set kind='lead' where org_id=$1 returning id", [b])).rows).toEqual([]);
      await expect(db.query("insert into public.contact_tags (org_id,name) values ($1,'Blocked')", [b]))
        .rejects.toMatchObject({ code: '42501' });

      if (role !== 'agent') continue;
      await expect(db.query("insert into public.contact_tags(org_id,name) values ($1,'Agent')", [a])).rejects.toMatchObject({code:'23505'});
      await expect(db.query('insert into public.contact_tag_links values ($1,$2,$3)', [a,contact,tagB])).rejects.toMatchObject({code:'23503'});
      await expect(db.query("insert into public.contact_field_values values ($1,$2,1,'number','1')", [a,contact])).rejects.toMatchObject({code:'23503'});
      await db.query("select public.create_contact_field($1,'Score','number')", [a]);
      await expect(db.query("insert into public.contact_field_values values ($1,$2,1,'number','true')", [a,contact])).rejects.toMatchObject({code:'23514'});
      await db.query("insert into public.contact_field_values values ($1,$2,1,'number','10')", [a,contact]);
      await expect(db.query("insert into public.contact_fields(org_id,slot,name,kind) values ($1,21,'Too many','text')", [a])).rejects.toMatchObject({code:'23514'});
      const batch = JSON.stringify([{name:'Import', phone_e164:'+919123456789',kind:'lead'}]);
      const importBatch = (org: string) => db.query('select public.import_contacts($1,$2) as inserted', [org,batch]);
      expect((await importBatch(a)).rows).toEqual([{inserted:1}]);
      expect((await importBatch(a)).rows).toEqual([{inserted:0}]);
      await expect(importBatch(b)).rejects.toMatchObject({code:'42501'});
      await db.query("delete from public.contacts where org_id=$1 and phone_e164='+919123456789'", [a]);
    }
  } finally {
    await db.close();
  }
}, 30000);
