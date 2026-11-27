import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code');
  const jar = await cookies();
  if (code && jar.get('relaxio-recovery-request')?.value === '1') {
    const client = await createClient();
    const {data,error} = await client.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const target = new URL('/reset-password', request.url);
      const response = NextResponse.redirect(target);
      response.cookies.set('relaxio-recovery-request', '', {path:'/auth/recovery', maxAge:0});
      response.cookies.set('relaxio-recovery-user', data.user.id, {
        httpOnly:true, secure:target.protocol === 'https:', sameSite:'lax', path:'/reset-password', maxAge:600,
      });
      response.headers.set('Cache-Control','no-store');
      return response;
    }
  }
  return NextResponse.redirect(new URL('/forgot-password?expired=1', request.url));
}
