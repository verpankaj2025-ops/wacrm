import { afterEach, expect, test, vi } from 'vitest';
import { importCsv } from '../app/contacts/actions';
import { organizationAccess } from '../lib/organization-access';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../lib/organization-access', () => ({ organizationAccess: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

test('contact import errors omit names and phones from logs and action responses', async () => {
  const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const name = 'Private Name';
  const phone = '+919876543210';
  const rpc = vi.fn().mockResolvedValue({
    error: { code: '23514', message: 'Database rejected row', details: name + ' ' + phone },
  });
  vi.mocked(organizationAccess).mockResolvedValue({
    client: { rpc }, org: { org_id: org }, writable: true,
  } as unknown as Awaited<ReturnType<typeof organizationAccess>>);
  const log = vi.spyOn(console, 'log');
  const info = vi.spyOn(console, 'info');
  const warn = vi.spyOn(console, 'warn');
  const error = vi.spyOn(console, 'error');
  const form = new FormData();
  form.set('workspace', org);
  form.set('csv', new File([`name,phone\n${name},${phone}\n`], 'contacts.csv'));
  expect(await importCsv({}, form)).toEqual({ error: 'The change could not be saved.' });
  expect(rpc).toHaveBeenCalledOnce();
  for (const method of [log, info, warn, error]) expect(method).not.toHaveBeenCalled();
});
