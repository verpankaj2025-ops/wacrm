import 'server-only';
import { cookies } from 'next/headers';
import { supabase } from './supabase';

export async function organizationAccess() {
  const client = await supabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client.from('organizations').select('org_id,name').order('name').order('org_id');
  if (error) throw new Error('Could not load organizations.');
  const preferred = (await cookies()).get('relaxio-org')?.value;
  const org = data.find(item => item.org_id === preferred) ?? data[0];
  if (!org) return { client, org: null, writable: false, role: undefined };
  const { data: membership, error: membershipError } = await client.from('memberships').select('role')
    .eq('org_id', org.org_id).eq('user_id', user.id).limit(1);
  if (membershipError) throw new Error('Could not load membership.');
  const role = membership?.[0]?.role;
  return { client, org: role ? org : null, role, writable: ['owner', 'admin', 'agent'].includes(role) };
}
