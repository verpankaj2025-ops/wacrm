import { NextResponse } from "next/server";
import { z } from "zod";
import { routeToAI } from "@/lib/ai/router";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const input = z.object({ message: z.string().trim().min(1).max(4000) });

export async function POST(request: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = checkRateLimit(`ai-chat:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!limit.success) return rateLimitResponse(limit);

  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a message of 1 to 4000 characters." }, { status: 400 });
  }
  return NextResponse.json(await routeToAI(parsed.data.message));
}
