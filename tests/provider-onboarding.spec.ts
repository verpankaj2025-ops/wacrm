import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

test('local provider flow creates an organization and redeems a copied invitation', async ({ browser, page }) => {
  test.skip(process.env.RELAXIO_LOCAL_PROVIDER_TEST !== '1', 'Requires dedicated local Supabase and test Upstash credentials.');
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!origin || !serviceKey || !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) {
    throw new Error('Provider tests require a local Supabase URL and service role key.');
  }
  const admin = createClient(origin, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const nonce = randomUUID();
  const owner = 'owner-' + nonce + '@example.com';
  const guest = 'guest-' + nonce + '@example.com';
  const org = 'Relaxio Test ' + nonce;
  const password = 'Test-' + randomUUID();
  const users: string[] = [];

  const guestContext = await browser.newContext();
  try {
    await page.goto('/signup');
    await page.getByLabel('Email').fill(owner);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('status')).toHaveText('Check your email for a confirmation link.');
    const { data: listed, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw listError;
    const ownerUser = listed.users.find(user => user.email === owner);
    if (!ownerUser) throw new Error('Signup did not create the owner');
    users.push(ownerUser.id);
    const { error: confirmationError } = await admin.auth.admin.updateUserById(ownerUser.id, { email_confirm: true });
    if (confirmationError) throw confirmationError;
    const { data: guestData, error: guestError } = await admin.auth.admin.createUser({ email: guest, password, email_confirm: true });
    if (guestError) throw guestError;
    users.push(guestData.user.id);

    await page.getByLabel('Email').fill(owner);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Organization name').fill(org);
    await page.getByRole('button', { name: 'Create organization' }).click();
    await expect(page.getByRole('heading', { name: org })).toBeVisible();
    await page.getByLabel('Invitee email').fill(guest);
    await page.getByRole('button', { name: 'Create invite link' }).click();
    const link = page.getByRole('textbox', { name: 'Invitation link' });
    await expect(link).toHaveValue(/\/join\/[a-f0-9]{64}$/);

    const guestPage = await guestContext.newPage();
    const acceptedLink = await link.inputValue();
    await guestPage.goto(acceptedLink);
    await guestPage.getByRole('link', { name: 'Sign in', exact: true }).click();
    await guestPage.getByLabel('Email').fill(guest);
    await guestPage.getByLabel('Password').fill(password);
    await guestPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await guestPage.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(guestPage.getByRole('heading', { name: org })).toBeVisible();
    await expect(guestPage.getByText(guest + ' (you)')).toBeVisible();
    await expect(guestPage.getByRole('heading', { name: 'Invite a teammate' })).toHaveCount(0);

    await page.getByLabel('Invitee email').fill(guest);
    await page.getByRole('button', { name: 'Create invite link' }).click();
    await expect(link).not.toHaveValue(acceptedLink);
    const replayToken = new URL(await link.inputValue()).pathname.split('/').pop()!;
    const hash = createHash('sha256').update(replayToken).digest('hex');
    const responses = await Promise.all(Array.from({ length: 2 }, () =>
      admin.rpc('accept_invitation', { p_actor: guestData.user.id, p_hash: hash })));
    expect(responses.map(result => result.error)).toEqual([null, null]);
    expect(responses.filter(result => result.data)).toHaveLength(1);

  } finally {
    await guestContext.close();
    const { error } = await admin.from('organizations').delete().eq('name', org);
    if (error) throw error;
    for (const id of users) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(id);
      if (cleanupError) throw cleanupError;
    }
  }
});
