import { expect, test } from '@playwright/test';

test('signup and login preserve a valid invitation without exposing malformed redirects', async ({ page }) => {
  const token = 'a'.repeat(64);
  await page.goto('/join/' + token);
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(token + '$'));
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await page.goto('/join/invalid');
  await expect(page.getByRole('heading', { name: 'Invitation unavailable' })).toBeVisible();
});

test('protected organization page requires login and rejects outside callback destinations', async ({ page }) => {
  await page.goto('/organizations');
  await expect(page).toHaveURL('/login');
  await page.goto('/auth/callback?next=//example.com');
  await expect(page.getByRole('status')).toHaveText('This sign-in link is invalid or expired. Please sign in again.');
  expect(new URL(page.url()).searchParams.get('next')).toBe('/organizations');
});
