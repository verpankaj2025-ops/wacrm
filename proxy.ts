import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(batch, headers) {
          for (const { name, value } of batch) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of batch) response.cookies.set(name, value, options);
          for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
        },
      },
    },
  );
  await client.auth.getClaims();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/organizations/:path*', '/join/:path*', '/contacts/:path*', '/pipeline/:path*', '/inbox/:path*', '/automations/:path*'] };
