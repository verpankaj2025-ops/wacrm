'use server';

import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { appUrl } from '../lib/config';
import { allowAttempt, digest } from '../lib/rate-limit';
import { supabase } from '../lib/supabase';
import { inviteInput, loginInput, memberChange, orgName, safeDestination, signupInput, token, uuid } from '../lib/validation';

function authRedirect(path: string, next: string, status: string): never {
  redirect(path + '?' + new URLSearchParams({ next, status }));
}

async function authLimit(identifier: string) {
  const ip = (await headers()).get('x-real-ip');
  if (ip && !(await allowAttempt('auth', 'ip:' + ip))) return false;
  return allowAttempt('auth', 'account:' + identifier);
}

export async function login(form: FormData) {
  const next = safeDestination(form.get('next'));
  const input = loginInput.safeParse(Object.fromEntries(form));
  if (!input.success) authRedirect('/login', next, 'invalid');
  if (!(await authLimit(input.data.email))) authRedirect('/login', next, 'rate');
  const client = await supabase();
  const { error } = await client.auth.signInWithPassword(input.data);
  if (error) authRedirect('/login', next, 'login');
  redirect(next);
}

export async function signup(form: FormData) {
  const next = safeDestination(form.get('next'));
  const input = signupInput.safeParse(Object.fromEntries(form));
  if (!input.success) authRedirect('/signup', next, 'invalid');
  if (!(await authLimit(input.data.email))) authRedirect('/signup', next, 'rate');
  const client = await supabase();
  const callback = appUrl('/auth/callback');
  callback.searchParams.set('next', next);
  const { data, error } = await client.auth.signUp({
    ...input.data, options: { emailRedirectTo: callback.href },
  });
  if (error) authRedirect('/signup', next, 'signup');
  if (data.session) redirect(next);
  authRedirect('/login', next, 'confirm');
}

export async function google(form: FormData) {
  const next = safeDestination(form.get('next'));
  if (process.env.RELAXIO_DATA_MODE === 'wacrm') authRedirect('/login', next, 'oauth');
  const ip = (await headers()).get('x-real-ip') ?? 'gateway';
  if (!(await allowAttempt('auth', 'oauth:' + ip))) authRedirect('/login', next, 'rate');
  const callback = appUrl('/auth/callback');
  callback.searchParams.set('next', next);
  const client = await supabase();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: callback.href },
  });
  if (error || !data.url) authRedirect('/login', next, 'oauth');
  redirect(data.url);
}

export async function signOut() {
  const client = await supabase();
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) redirect('/organizations?status=signout');
  (await cookies()).delete('relaxio-org');
  redirect('/login');
}

async function selectOrg(org: string) {
  (await cookies()).set('relaxio-org', org, {
    httpOnly: true, sameSite: 'lax', secure: appUrl('/').protocol === 'https:', path: '/',
  });
}

export async function createOrganization(form: FormData) {
  const input = orgName.safeParse(form.get('name'));
  if (!input.success) redirect('/organizations?status=name');
  const client = await supabase();
  const { data, error } = await client.rpc('create_organization', { p_name: input.data });
  if (error || !data) redirect('/organizations?status=create');
  await selectOrg(data);
  redirect('/organizations');
}

export async function switchOrganization(form: FormData) {
  const org = uuid.safeParse(form.get('org'));
  if (!org.success) redirect('/organizations?status=access');
  const client = await supabase();
  const { data } = await client.from('organizations').select('org_id').eq('org_id', org.data).maybeSingle();
  if (!data) redirect('/organizations?status=access');
  await selectOrg(data.org_id);
  redirect('/organizations');
}

export type InviteResult = { link?: string; error?: string };

export async function createInvitation(_: InviteResult, form: FormData): Promise<InviteResult> {
  const input = inviteInput.safeParse(Object.fromEntries(form));
  if (!input.success) return { error: 'Enter a valid email and role.' };
  const raw = randomBytes(32).toString('hex');
  const client = await supabase();
  const { error } = await client.rpc('create_invitation', {
    p_org: input.data.org, p_email: input.data.email, p_role: input.data.role, p_hash: digest(raw),
  });
  if (error) return { error: 'You could not create this invitation.' };
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/organizations');
  return { link: appUrl('/join/' + raw).href };
}

export async function acceptInvitation(form: FormData) {
  const input = token.safeParse(form.get('token'));
  if (!input.success) redirect('/organizations?status=invite');
  const client = await supabase();
  const { data: { user } } = await client.auth.getUser();
  const join = '/join/' + input.data;
  if (!user) authRedirect('/login', join, 'required');
  if (!(await allowAttempt('invite', user.id))) redirect(join + '?status=rate');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc('accept_invitation', { p_actor: user.id, p_hash: digest(input.data) });
  if (error || !data) redirect(join + '?status=invite');
  await selectOrg(data);
  redirect('/organizations');
}

export async function revokeInvitation(form: FormData) {
  const org = uuid.safeParse(form.get('org'));
  const invite = uuid.safeParse(form.get('invite'));
  if (!org.success || !invite.success) redirect('/organizations?status=access');
  const client = await supabase();
  const { error } = await client.rpc('revoke_invitation', { p_org: org.data, p_id: invite.data });
  redirect(error ? '/organizations?status=access' : '/organizations');
}

export async function changeMembership(form: FormData) {
  const input = memberChange.safeParse(Object.fromEntries(form));
  if (!input.success) redirect('/organizations?status=access');
  const client = await supabase();
  const { org, user, role } = input.data;
  const { error } = await client.rpc('change_membership', {
    p_org: org, p_user: user, p_role: role === 'remove' ? null : role,
  });
  if (error?.code === '23514') redirect('/organizations?status=owner');
  redirect(error ? '/organizations?status=access' : '/organizations');
}
