import { NextResponse } from 'next/server';
import { appUrl } from '../../../lib/config';
import { supabase } from '../../../lib/supabase';
import { safeDestination } from '../../../lib/validation';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get('code');
  const next = safeDestination(params.get('next'));
  if (code) {
    const client = await supabase();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(appUrl(next));
  }
  const target = appUrl('/login');
  target.search = new URLSearchParams({ next, status: 'callback' }).toString();
  return NextResponse.redirect(target);
}
