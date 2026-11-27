import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

test('deals reject cross-org contacts and stages and enforce role-checked stage moves', async () => {
  const db = new PGlite();
  const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const id = (n: number) => '00000000-0000-4000-8000-00000000000' + n;
  const [agent, viewer, contactA, contactB, from, to, foreignStage] = [1, 2, 3, 4, 5, 6, 7].map(id);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    for (const migration of ['202611270001_organizations.sql', '202611270003_contacts.sql', '202611270004_pipeline.sql']) {
      await db.exec(readFileSync('supabase/migrations/' + migration, 'utf8'));
    }
    await db.query("insert into public.organizations(org_id,name) values ($1,'Org A'),($2,'Org B')", [orgA, orgB]);
    await db.query('insert into auth.users(id) values ($1),($2)', [agent, viewer]);
    await db.query("insert into public.memberships(org_id,user_id,role) values ($1,$2,'agent'),($1,$3,'viewer')", [orgA, agent, viewer]);
    await db.query("insert into public.contacts(org_id,id,name,phone_e164) values ($1,$3,'A','+919876543210'),($2,$4,'B','+919876543210')", [orgA, orgB, contactA, contactB]);
    await db.query("insert into public.pipeline_stages(org_id,id,name) values ($1,$3,'New'),($1,$4,'Qualified'),($2,$5,'Private')", [orgA, orgB, from, to, foreignStage]);
    async function actor(user: string) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.exec('set role authenticated');
    }
    const insert = (contact: string, stage: string) => db.query<{ id: string }>(
      "insert into public.deals(org_id,contact_id,stage_id,title) values ($1,$2,$3,'Follow-up') returning id",
      [orgA, contact, stage],
    );

    await actor(agent);
    await db.query("insert into public.pipeline_stages(org_id,name) values ($1,'Nurture')", [orgA]);
    await expect(db.query("insert into public.pipeline_stages(org_id,name) values ($1,'Blocked')", [orgB]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(insert(contactB, from)).rejects.toMatchObject({ code: '23503', constraint: 'deals_org_id_contact_id_fkey' });
    await expect(insert(contactA, foreignStage)).rejects.toMatchObject({ code: '23503', constraint: 'deals_org_id_stage_id_fkey' });
    const { rows: [deal] } = await insert(contactA, from);
    const move = (source: string, target: string, org = orgA) => db.query('select public.move_deal($1,$2,$3,$4) as moved', [org, deal.id, source, target]);
    await expect(move(from, foreignStage)).rejects.toMatchObject({ code: '23503' });
    await expect(move(from, to, orgB)).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('update public.deals set stage_id=$1 where id=$2', [foreignStage, deal.id]))
      .rejects.toMatchObject({ code: '23503' });
    expect((await move(from, to)).rows).toEqual([{ moved: true }]);
    expect((await move(from, to)).rows).toEqual([{ moved: false }]);

    await actor(viewer);
    expect((await db.query('select stage_id from public.deals')).rows).toEqual([{ stage_id: to }]);
    expect((await db.query('select name from public.pipeline_stages where org_id=$1', [orgB])).rows).toEqual([]);
    await expect(move(to, from)).rejects.toMatchObject({ code: '42501' });
    expect((await db.query('update public.deals set stage_id=$1 returning id', [from])).rows).toEqual([]);
    await expect(insert(contactA, from)).rejects.toMatchObject({ code: '42501' });

    await db.exec('reset role');
    await db.query('delete from public.organizations where org_id=$1', [orgA]);
    expect((await db.query('select * from public.deals')).rows).toEqual([]);
  } finally {
    await db.close();
  }
}, 30000);
