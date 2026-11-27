import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { appUrl } from '../../../lib/config';
import { supabase } from '../../../lib/supabase';

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code');
  const jar = await cookies();
  if (code && jar.get('relaxio-recovery-request')?.value === '1') {
    const client = await supabase();
    const {data,error} = await client.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const target = appUrl('/reset-password');
      const response = NextResponse.redirect(target);
      response.cookies.set('relaxio-recovery-request', '', {path:'/auth/recovery', maxAge:0});
      response.cookies.set('relaxio-recovery-user', data.user.id, {
        httpOnly:true, secure:target.protocol === 'https:', sameSite:'lax', path:'/reset-password', maxAge:600,
      });
      response.headers.set('Cache-Control','no-store');
      return response;
    }
  }
  return NextResponse.redirect(appUrl('/forgot-password?status=expired'));
}
