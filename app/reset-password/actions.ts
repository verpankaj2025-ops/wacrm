'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export async function savePassword(form: FormData) {
  const jar = await cookies();
  const recoveryUser = jar.get('relaxio-recovery-user')?.value;
  if (!recoveryUser) redirect('/forgot-password?status=expired');
  const password = form.get('password');
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72 ||
    password !== form.get('confirmation')) redirect('/reset-password?status=invalid');
  const client = await supabase();
  const {data, error:userError} = await client.auth.getUser();
  if (userError || data.user?.id !== recoveryUser) redirect('/forgot-password?status=expired');
  const {error} = await client.auth.updateUser({password});
  if (error) redirect('/reset-password?status=retry');
  jar.set('relaxio-recovery-user', '', {path:'/reset-password', maxAge:0});
  await client.auth.signOut({scope:'local'});
  redirect('/login?status=password-reset');
}
