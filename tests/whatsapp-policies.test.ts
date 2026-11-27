import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

test('WhatsApp replay, routing, opt-out, receipt ordering, tenant links and token privileges', async () => {
  const db = new PGlite();
  const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const user = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
    `);
    for (const m of ['001_organizations','003_contacts','004_pipeline','005_whatsapp']) {
      await db.exec(readFileSync('supabase/migrations/202611270' + m + '.sql','utf8'));
    }
    await db.query("insert into public.organizations(org_id,name) values ($1,'Org A'),($2,'Org B')",[a,b]);
    await db.query('insert into auth.users(id) values ($1)',[user]);
    await db.query("insert into public.memberships(org_id,user_id,role) values ($1,$2,'viewer')",[a,user]);
    await db.query("insert into public.whatsapp_channels values ($1,'12345','54321','ciphertext',1),($2,'99999','54321','other',1)",[a,b]);
    await db.exec('grant select,insert on public.contacts to service_role; set role service_role');
    const stop = {kind:'in', id:'wamid.same', timestamp:'1760000000', from:'919876543210', body:'STOP'};
    const ingest = (org: string, phone: string, events: unknown[]) => db.query('select public.ingest_whatsapp($1,$2,$3)',[org,phone,JSON.stringify(events)]);
    expect((await db.query("select public.whatsapp_route('12345') as org")).rows).toEqual([{org:a}]);
    await expect(ingest(b,'12345',[stop])).rejects.toMatchObject({code:'42501'});
    await ingest(a,'12345',[stop,stop]);
    await ingest(a,'12345',[stop]);
    await ingest(b,'99999',[{...stop,body:'Hello'}]);
    expect((await db.query('select org_id,body from public.whatsapp_messages order by org_id')).rows)
      .toEqual([{org_id:a,body:'STOP'},{org_id:b,body:'Hello'}]);
    expect((await db.query('select org_id,opted_in from public.whatsapp_consent')).rows).toEqual([{org_id:a,opted_in:false}]);
    const sent = {kind:'status',id:'wamid.out',timestamp:'1760000001'};
    await ingest(a,'12345',[{...sent,status:'read'},{...sent,status:'delivered'}]);
    expect((await db.query('select status from public.whatsapp_receipts')).rows).toEqual([{status:'read'}]);
    await db.exec('reset role');
    const {rows:[threadB]} = await db.query<{id:string}>('select id from public.whatsapp_conversations where org_id=$1',[b]);
    const {rows:[threadA]} = await db.query<{contact_id:string}>('select contact_id from public.whatsapp_conversations where org_id=$1',[a]);
    const {rows:[stage]} = await db.query<{id:string}>("insert into public.pipeline_stages(org_id,name) values ($1,'New') returning id",[a]);
    await expect(db.query("insert into public.deals(org_id,contact_id,stage_id,title,conversation_id) values ($1,$2,$3,'Test',$4)",
      [a,threadA.contact_id,stage.id,threadB.id])).rejects.toMatchObject({code:'23503',constraint:'deal_conversation_same_org'});
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    await db.exec('set role authenticated');
    await expect(db.query('select encrypted_token from public.whatsapp_channels')).rejects.toMatchObject({code:'42501'});
    await expect(db.query("select public.whatsapp_route('12345')")).rejects.toMatchObject({code:'42501'});
    expect((await db.query('select org_id from public.whatsapp_messages')).rows).toEqual([{org_id:a}]);
    expect((await db.query("update public.whatsapp_conversations set status='closed' returning id")).rows).toEqual([]);
    await expect(db.query('select public.record_whatsapp_consent($1,$2,true)',[a,threadA.contact_id])).rejects.toMatchObject({code:'42501'});
  } finally { await db.close(); }
},30000);
