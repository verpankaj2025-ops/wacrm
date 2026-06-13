import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.META_VERIFY_TOKEN
  ) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return NextResponse.json(
    { error: "verification failed" },
    { status: 403 }
  );
}

export async function POST(request: Request) {
  const body = await request.json();

  console.log(
    "[META LEAD WEBHOOK]",
    JSON.stringify(body, null, 2)
  );

  return NextResponse.json({
    success: true,
  });
}