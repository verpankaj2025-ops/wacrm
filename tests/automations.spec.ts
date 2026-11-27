import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, test } from '@playwright/test';

test('automation worker rejects unauthenticated requests', async ({request}) => {
  expect((await request.post('/api/automations/run')).status()).toBe(401);
});

test('admin builds and saves a conditional workflow', async ({page,context}) => {
  test.skip(Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),'Requires the isolated test provider.');
  const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const user = {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',aud:'authenticated',role:'authenticated',email:'test@example.com'};
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  let workflow: Record<string,unknown>|undefined;
  const server = createServer(async (request,response)=>{
    response.setHeader('Content-Type','application/json');
    const send = (value:unknown)=>response.end(JSON.stringify(value));
    switch (new URL(request.url!,'http://localhost').pathname) {
      case '/auth/v1/user': return send(user);
      case '/rest/v1/organizations': return send([{org_id:org,name:'Test organization'}]);
      case '/rest/v1/memberships': return send([{role:'admin'}]);
      case '/rest/v1/automation_runs':
      case '/rest/v1/contact_tags':
      case '/rest/v1/whatsapp_conversations': return send([]);
      case '/rest/v1/automation_workflows': {
        if (request.method === 'POST') {
          const chunks:Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          workflow = {...JSON.parse(Buffer.concat(chunks).toString()),id};
          return send({id});
        }
        return send(workflow ? [workflow] : []);
      }
      default: response.statusCode=404; return send({});
    }
  });
  server.listen(54329,'127.0.0.1');
  await once(server,'listening');
  const pack = (value:object)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now()/1000)+3600;
  const access = pack({alg:'HS256',typ:'JWT'})+'.'+pack({sub:user.id,exp,role:user.role})+'.c2ln';
  const cookie = 'base64-'+pack({access_token:access,refresh_token:'test-refresh',expires_at:exp,user});
  try {
    await context.addCookies([{name:'sb-127-auth-token',value:cookie,url:'http://127.0.0.1:3100'}]);
    await page.goto('/automations');
    await page.getByText('New workflow',{exact:true}).click();
    await page.getByLabel('Workflow name').fill('Lead greeting');
    await page.getByRole('combobox',{name:'Trigger',exact:true}).selectOption('keyword');
    await page.getByLabel('Keyword',{exact:true}).fill('hello');
    await page.getByRole('combobox',{name:'Run when'}).selectOption('lead');
    await page.getByLabel('Wait (seconds)').fill('90');
    await page.getByRole('button',{name:'Add step'}).click();
    await page.getByRole('combobox',{name:'Action',exact:true}).last().selectOption('webhook');
    await page.getByLabel('Enable workflow').check();
    await page.getByRole('button',{name:'Save workflow'}).click();
    await expect(page.getByText('Lead greeting · Enabled',{exact:true})).toBeVisible();
    expect(workflow).toMatchObject({org_id:org,trigger_kind:'keyword',keyword:'hello',enabled:true,
      steps:[{kind:'wait',when:'lead',seconds:90},{kind:'webhook',when:'always'}]});
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
