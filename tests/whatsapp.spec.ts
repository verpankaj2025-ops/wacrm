import { once } from 'node:events';
import { expect, test } from '@playwright/test';

test('WhatsApp webhook rejects unsigned requests and inbox requires authentication', async ({ page, request }) => {
  const response = await request.post('/api/whatsapp/webhook', { data: { object:'whatsapp_business_account',entry:[] } });
  expect(response.status()).toBe(401);
  await page.setViewportSize({ width:390,height:844 });
  await page.goto('/inbox');
  await expect(page).toHaveURL('/login');
});

test('GET verifies the token and a signed empty batch is accepted', async ({ request }) => {
  const params = new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':'fixture-verify-token','hub.challenge':'fixture-challenge'});
  const verified = await request.get('/api/whatsapp/webhook?' + params);
  expect(verified.status()).toBe(200);
  expect(await verified.text()).toBe('fixture-challenge');
  params.set('hub.verify_token','invalid');
  expect((await request.get('/api/whatsapp/webhook?' + params)).status()).toBe(403);
  const body = JSON.stringify({object:'whatsapp_business_account',entry:[]});
  const {createHmac} = await import('node:crypto');
  const signature = 'sha256=' + createHmac('sha256','fixture-app-secret').update(body).digest('hex');
  const accepted = await request.post('/api/whatsapp/webhook',{data:body,headers:{'x-hub-signature-256':signature}});
  expect(accepted.status()).toBe(200);
  const rejected = await request.post('/api/whatsapp/webhook',{data:body + ' ',headers:{'x-hub-signature-256':signature}});
  expect(rejected.status()).toBe(401);
});

test('inbox shows the thread separately on mobile and alongside the list on desktop', async ({page,context}) => {
  test.skip(Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),'Requires the isolated test provider.');
  const {createServer} = await import('node:http');
  const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const user = {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',aud:'authenticated',role:'authenticated',email:'test@example.com'};
  const contact = {id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',name:'Example contact'};
  const thread = {id,status:'open',contact_id:contact.id,phone_number_id:'12345',assignee_id:null,contacts:{name:contact.name}};
  const server = createServer((request,response) => {
    const url = new URL(request.url!, 'http://localhost');
    response.setHeader('Content-Type','application/json');
    const send = (value:unknown) => response.end(JSON.stringify(value));
    switch(url.pathname) {
      case '/auth/v1/user': return send(user);
      case '/rest/v1/organizations': return send([{org_id:org,name:'Example Organization'}]);
      case '/rest/v1/memberships': return send([{role:'agent'}]);
      case '/rest/v1/whatsapp_conversations': return send([thread]);
      case '/rest/v1/whatsapp_messages': return send([{message_id:'wamid.test',direction:'out',body:'Appointment confirmed',occurred_at:'2026-01-01T00:00:00Z'}]);
      case '/rest/v1/whatsapp_consent': return send([{opted_in:false,source:'stop'}]);
      case '/rest/v1/whatsapp_receipts': return send([{message_id:'wamid.test',status:'read'}]);
      case '/rest/v1/whatsapp_notes':
        return send(request.method === 'POST' ? null : []);
      case '/rest/v1/rpc/organization_roster': return send([]);
      default: response.statusCode=404; return send({});
    }
  });
  server.listen(54329,'127.0.0.1');
  await once(server,'listening');
  const pack = (value:object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now()/1000)+3600;
  const access = pack({alg:'HS256',typ:'JWT'})+'.'+pack({sub:user.id,exp,role:user.role})+'.c2ln';
  const cookie = 'base64-'+pack({access_token:access,refresh_token:'test-refresh',expires_at:exp,user});
  try {
    await context.addCookies([{name:'sb-127-auth-token',value:cookie,url:'http://127.0.0.1:3100'}]);
    await page.setViewportSize({width:390,height:844});
    await page.goto('/inbox');
    await page.getByRole('link',{name:contact.name}).click();
    await expect(page.getByRole('navigation',{name:'Conversations'})).toBeHidden();
    await expect(page.getByText('Appointment confirmed')).toBeVisible();
    await expect(page.getByText('read',{exact:true})).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Contact opted out with STOP.');
    await expect(page.getByRole('button',{name:'Send message'})).toHaveCount(0);
    await page.getByLabel('Internal note').fill('Call after 4');
    await page.getByRole('button',{name:'Add note'}).click();
    await expect(page.getByText('Note added.')).toBeVisible();
    await page.setViewportSize({width:1280,height:900});
    await expect(page.getByRole('navigation',{name:'Conversations'})).toBeVisible();
    await expect(page.getByText('Appointment confirmed')).toBeVisible();
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
