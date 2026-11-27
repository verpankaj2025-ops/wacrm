'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function savePassword(form: FormData) {
  const jar = await cookies();
  const recoveryUser = jar.get('relaxio-recovery-user')?.value;
  if (!recoveryUser) redirect('/forgot-password?expired=1');
  const password = form.get('password');
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72) {
    redirect('/reset-password?status=invalid');
  }
  if (password !== form.get('confirmation')) redirect('/reset-password?status=mismatch');
  const client = await createClient();
  const {data, error:userError} = await client.auth.getUser();
  if (userError || data.user?.id !== recoveryUser) redirect('/forgot-password?expired=1');
  const {error} = await client.auth.updateUser({password});
  switch (error?.code) {
    case 'same_password':
      redirect('/reset-password?status=same');
    case 'weak_password':
      redirect('/reset-password?status=weak');
    case 'reauthentication_needed':
    case 'session_expired':
    case 'session_not_found':
      redirect('/forgot-password?expired=1');
  }
  if (error) redirect('/reset-password?status=retry');
  jar.set('relaxio-recovery-user', '', {path:'/reset-password', maxAge:0});
  await client.auth.signOut({scope:'local'});
  redirect('/login?status=password-reset');
}
