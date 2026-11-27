'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { appUrl } from '../../lib/config';
import { allowAttempt } from '../../lib/rate-limit';
import { supabase } from '../../lib/supabase';

export async function requestRecovery(form: FormData) {
  const email = z.string().trim().toLowerCase().pipe(z.email().max(254)).safeParse(form.get('email'));
  if (!email.success) redirect('/forgot-password?status=invalid');
  if (!(await allowAttempt('auth', 'recovery:' + email.data))) redirect('/forgot-password?status=retry');
  const callback = appUrl('/auth/recovery');
  const client = await supabase();
  const {error} = await client.auth.resetPasswordForEmail(email.data, {redirectTo:callback.href});
  if (error) redirect('/forgot-password?status=retry');
  (await cookies()).set('relaxio-recovery-request', '1', {
    httpOnly:true, secure:callback.protocol === 'https:', sameSite:'lax', path:'/auth/recovery', maxAge:3600,
  });
  redirect('/forgot-password?status=sent');
}
