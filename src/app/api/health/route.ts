import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("profiles")
      .select("user_id")
      .limit(1);

    const dbHealthy = !error;

    return NextResponse.json(
      {
        status: dbHealthy ? "ok" : "degraded",

        service: "wacrm",

        version: process.env.npm_package_version ?? "0.2.2",

        timestamp,

        checks: {
          application: "ok",
          database: dbHealthy ? "ok" : "failed",
        },
      },
      {
        status: dbHealthy ? 200 : 503,
      }
    );
  } catch (err) {
    console.error("Health check failed", err);

    return NextResponse.json(
      {
        status: "failed",

        service: "wacrm",

        timestamp,

        checks: {
          application: "ok",
          database: "failed",
        },
      },
      {
        status: 503,
      }
    );
  }
}