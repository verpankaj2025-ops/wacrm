import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, test } from '@playwright/test';

test('agent moves a deal between Kanban stages and viewer can only read', async ({ page, context }) => {
  test.skip(Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), 'Requires the isolated test provider.');
  const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', aud: 'authenticated', role: 'authenticated', email: 'test@example.com' };
  const from = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const to = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const contact = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const deal = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  let role = 'agent';
  let stage = from;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    response.setHeader('Content-Type', 'application/json');
    const send = (payload: unknown) => response.end(JSON.stringify(payload));
    switch (url.pathname) {
      case '/auth/v1/user': return send(user);
      case '/rest/v1/memberships': return send([{ role }]);
      case '/rest/v1/organizations': return send([{ org_id: org, name: 'Example Organization' }]);
      case '/rest/v1/pipeline_stages': return send([{ id: from, name: 'New' }, { id: to, name: 'Qualified' }]);
      case '/rest/v1/whatsapp_conversations': return send([]);
      case '/rest/v1/contacts': return send([{ id: contact, name: 'Example Contact' }]);
      case '/rest/v1/deals': return send([{ id: deal, title: 'Follow-up deal', stage_id: stage, contact_id: contact, amount_inr: 100,
        contacts: { name: 'Example Contact' } }]);
      case '/rest/v1/rpc/move_deal': {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString());
        if (role !== 'agent' || body.p_org !== org || body.p_deal !== deal || body.p_from !== stage || body.p_to !== to) {
          response.statusCode = 400;
          return send({ code: '22023', message: 'Invalid stage move' });
        }
        stage = to;
        return send(true);
      }
      default: response.statusCode = 404; return send({});
    }
  });
  server.listen(54329, '127.0.0.1');
  await once(server, 'listening');
  const pack = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = pack({ alg: 'HS256', typ: 'JWT' }) + '.' + pack({ sub: user.id, exp, role: user.role }) + '.c2ln';
  const encoded = 'base64-' + pack({ access_token: access, refresh_token: 'test-refresh', expires_at: exp, user });
  try {
    await context.addCookies([{ name: 'sb-127-auth-token', value: encoded, url: 'http://127.0.0.1:3100' }]);
    await page.goto('/pipeline');
    const newStage = page.getByRole('region', { name: 'New', exact: true });
    const qualified = page.getByRole('region', { name: 'Qualified', exact: true });
    await expect(newStage.getByText('Follow-up deal', { exact: true })).toBeVisible();
    await newStage.getByLabel('Move to stage').selectOption(to);
    await newStage.getByRole('button', { name: 'Move deal' }).click();
    await expect(qualified.getByText('Follow-up deal', { exact: true })).toBeVisible();
    await expect(newStage.getByText('Follow-up deal', { exact: true })).toHaveCount(0);
    role = 'viewer';
    await page.reload();
    await expect(qualified.getByText('Follow-up deal', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move deal' })).toHaveCount(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
