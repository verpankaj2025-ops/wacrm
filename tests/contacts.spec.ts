import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, test } from '@playwright/test';

test('imports contacts, downloads a rejected-row report and skips a repeated CSV', async ({ page, context }) => {
  test.skip(Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), 'The browser fixture requires the default isolated test provider.');
  const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', aud: 'authenticated', role: 'authenticated', email: 'test@example.com' };
  const contacts = new Map<string, { id: string; name: string; phone_e164: string; kind: string }>();
  // Exercise the browser and real Server Action against a local provider fixture.
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    response.setHeader('Content-Type', 'application/json');
    if (path === '/auth/v1/user') return response.end(JSON.stringify(user));
    if (path === '/rest/v1/memberships') return response.end(JSON.stringify([{ role: 'agent' }]));
    if (path === '/rest/v1/organizations') return response.end(JSON.stringify([{ org_id: org, name: 'Example Organization' }]));
    if (path === '/rest/v1/contacts') return response.end(JSON.stringify([...contacts.values()]));
    if (path === '/rest/v1/contact_tags' || path === '/rest/v1/contact_fields') return response.end('[]');
    if (path === '/rest/v1/rpc/import_contacts') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.p_org !== org) { response.statusCode = 403; return response.end('{}'); }
      let inserted = 0;
      for (const row of body.p_rows) {
        if (contacts.has(row.phone_e164)) continue;
        contacts.set(row.phone_e164, { ...row, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
        inserted++;
      }
      return response.end(JSON.stringify(inserted));
    }
    response.statusCode = 404;
    response.end('{}');
  });
  server.listen(54329, '127.0.0.1');
  await once(server, 'listening');
  const pack = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = pack({ alg: 'HS256', typ: 'JWT' }) + '.' + pack({ sub: user.id, exp, role: user.role }) + '.c2ln';
  const encoded = 'base64-' + pack({ access_token: access, refresh_token: 'test-refresh', expires_at: exp, user });
  try {
    await context.addCookies([{ name: 'sb-127-auth-token', value: encoded, url: 'http://127.0.0.1:3100' }]);
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: 'Contacts and leads' })).toBeVisible();
    const csv = { name: 'contacts.csv', mimeType: 'text/csv', buffer: Buffer.from('name,phone,kind\nExample Person,09876543210,lead\nRejected,bad,contact\n') };
    const file = page.getByLabel('CSV file');
    await file.setInputFiles(csv);
    await page.getByRole('button', { name: 'Import CSV' }).click();
    await expect(page.getByRole('status')).toHaveText('1 imported · 0 already present · 1 rejected');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download rejected rows' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('rejected-contacts.csv');
    expect(await readFile(await download.path(), 'utf8')).toBe('"Row","Reason"\r\n"3","Invalid phone"\r\n');
    await expect(page.getByRole('link', { name: 'Example Person' })).toHaveCount(1);
    await file.setInputFiles(csv);
    await page.getByRole('button', { name: 'Import CSV' }).click();
    await expect(page.getByRole('status')).toHaveText('0 imported · 1 already present · 1 rejected');
    await expect(page.getByRole('link', { name: 'Example Person' })).toHaveCount(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
