"use server";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function requestRecovery(value: string) {
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(value);
  const origin = (await headers()).get("origin");
  if (!email.success || !origin) return false;

  const callback = new URL("/auth/recovery", origin);
  const key = createHash("sha256").update(email.data).digest("hex");
  if (!checkRateLimit(`recovery:${key}`, { limit: 3, windowMs: 900_000 }).success) {
    return false;
  }

  const client = await createClient();
  const { error } = await client.auth.resetPasswordForEmail(email.data, {
    redirectTo: callback.href,
  });
  if (error) return false;

  (await cookies()).set("relaxio-recovery-request", "1", {
    httpOnly: true,
    secure: callback.protocol === "https:",
    sameSite: "lax",
    path: "/auth/recovery",
    maxAge: 3600,
  });
  return true;
}
