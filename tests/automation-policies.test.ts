import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

test('automation events are tenant scoped and leases support waits, retries and safe external failure', async () => {
  const db = new PGlite();
  const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const viewer = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    for (const m of ['001_organizations','003_contacts','004_pipeline','005_whatsapp','006_automations']) {
      await db.exec(readFileSync('supabase/migrations/202611270' + m + '.sql','utf8'));
    }
    await db.query("insert into public.organizations(org_id,name) values ($1,'Org A'),($2,'Org B')",[a,b]);
    await db.query('insert into auth.users(id) values ($1)',[viewer]);
    await db.query("insert into public.memberships(org_id,user_id,role) values ($1,$2,'viewer')",[a,viewer]);
    await db.query("insert into public.automation_workflows(org_id,name,trigger_kind,steps,enabled) values ($1,'A','contact','[{},{}]',true),($2,'B','contact','[{},{}]',true)",[a,b]);
    await db.query("insert into public.contacts(org_id,name,phone_e164) values ($1,'A','+919876543210')",[a]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[viewer]);
    await db.exec('set role authenticated');
    expect((await db.query('select org_id from public.automation_workflows')).rows).toEqual([{org_id:a}]);
    expect((await db.query('select org_id from public.automation_runs')).rows).toEqual([{org_id:a}]);
    await expect(db.query('select * from public.claim_automation()')).rejects.toMatchObject({code:'42501'});
    expect((await db.query('update public.automation_workflows set enabled=false returning id')).rows).toEqual([]);
    await db.exec('reset role; set role service_role');
    const claim = () => db.query<{id:string;lease_id:string;step_index:number;attempts:number}>('select id,lease_id,step_index,attempts from public.claim_automation()');
    const {rows:[job]} = await claim();
    expect(job.step_index).toBe(0);
    const settle = (lease:string,result:string,wait=0,org=a) => db.query('select public.settle_automation($1,$2,$3,$4,$5) as ok',[org,job.id,lease,result,wait]);
    expect((await claim()).rows).toEqual([]);
    expect((await settle(job.lease_id,'advance',0,b)).rows).toEqual([{ok:false}]);
    await settle(job.lease_id,'advance',60);
    expect((await claim()).rows).toEqual([]);
    const due = () => db.query("update public.automation_runs set run_at=now() where org_id=$1 and id=$2",[a,job.id]);
    await due();
    const {rows:[resumed]} = await claim();
    expect(resumed.step_index).toBe(1);
    expect((await settle(job.lease_id,'advance')).rows).toEqual([{ok:false}]);
    await settle(resumed.lease_id,'retry');
    expect((await claim()).rows).toEqual([]);
    await due();
    const {rows:[retry]} = await claim();
    expect(retry.attempts).toBe(2);
    expect((await settle(retry.lease_id,'external')).rows).toEqual([{ok:true}]);
    await db.query("update public.automation_runs set lease_until=now() where org_id=$1 and id=$2",[a,job.id]);
    expect((await claim()).rows).toEqual([]);
    expect((await db.query('select state from public.automation_runs where org_id=$1',[a])).rows).toEqual([{state:'failed'}]);
    await db.exec('reset role');
    await db.query("insert into public.automation_workflows(org_id,name,trigger_kind,interval_minutes,next_at,steps,enabled) values ($1,'Recurring','schedule',5,now(),'[{}]',true)",[a]);
    await db.query("insert into public.whatsapp_channels values ($1,'12345','54321','ciphertext',1)",[a]);
    await db.query("insert into public.automation_workflows(org_id,name,trigger_kind,keyword,steps,enabled) values ($1,'Keyword','keyword','hello','[{}]',true),($1,'Inbound','inbound',null,'[{}]',true)",[a]);
    await db.exec('set role service_role');
    const event = {kind:'in',id:'wamid.keyword',timestamp:'1760000000',from:'919876543210',body:'HELLO'};
    await db.query("select public.ingest_whatsapp($1,'12345',$2)",[a,JSON.stringify([event,event])]);
    await claim();
    expect((await db.query("select trigger_kind from public.automation_runs where org_id=$1 order by trigger_kind",[a])).rows)
      .toEqual(['contact','inbound','keyword','schedule'].map(trigger_kind=>({trigger_kind})));

  } finally { await db.close(); }
},30000);
