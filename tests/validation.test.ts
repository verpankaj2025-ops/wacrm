import { expect, test } from 'vitest';
import { inviteInput, safeDestination, signupInput } from '../lib/validation';

test('redirects allow only the organization index or a valid invitation', () => {
  const join = '/join/' + 'a'.repeat(64);
  expect(safeDestination(join)).toBe(join);
  for (const path of ['//evil.example', '/\\evil.example', '/organizations?next=//evil', '/join/invalid']) {
    expect(safeDestination(path)).toBe('/organizations');
  }
});

test('invite input normalizes email and excludes owner grants', () => {
  const base = { org: 'e4115c86-b0b0-467a-a4fb-2cccbd7651e4', email: ' A@EXAMPLE.COM ' };
  expect(inviteInput.parse({ ...base, role: 'viewer' }).email).toBe('a@example.com');
  expect(inviteInput.safeParse({ ...base, role: 'owner' }).success).toBe(false);
  expect(signupInput.safeParse({ email: base.email, password: 'short' }).success).toBe(false);
});
