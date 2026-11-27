import 'server-only';
import { redirect } from 'next/navigation';
import { organizationAccess } from '../organization-access';

export async function inboxAccess() {
  const access = await organizationAccess();
  if (!access) redirect('/login');
  if (!access.org) redirect('/organizations');
  return {...access,org:access.org};
}
