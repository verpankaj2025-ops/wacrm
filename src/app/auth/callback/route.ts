import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const invite = request.nextUrl.searchParams.get("invite");
  let path = "/login?oauth_error=1";
  if (code) {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      path = invite && /^[a-zA-Z0-9_-]{1,256}$/.test(invite)
        ? `/join/${encodeURIComponent(invite)}`
        : "/dashboard";
    }
  }
  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
