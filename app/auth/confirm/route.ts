import { NextResponse } from 'next/server';
import { appUrl } from '../../../lib/config';
import { supabase } from '../../../lib/supabase';
import { safeDestination } from '../../../lib/validation';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const hash = params.get('token_hash');
  const next = safeDestination(params.get('next'));
  if (hash) {
    const client = await supabase();
    const { error } = await client.auth.verifyOtp({ token_hash: hash, type: 'email' });
    if (!error) return NextResponse.redirect(appUrl(next));
  }
  const target = appUrl('/login');
  target.search = new URLSearchParams({ next, status: 'callback' }).toString();
  return NextResponse.redirect(target);
}
