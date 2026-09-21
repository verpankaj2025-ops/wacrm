
import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/automations/admin-client"
import {
  canCancelBroadcast,
} from "@/lib/broadcast-lifecycle"

async function getAccount() {
  const supabase =
    await createClient()

  const {
    data: { user },
  } =
    await supabase.auth.getUser()

  if (!user) return null

  const {
    data: profile,
    error,
  } =
    await supabase
      .from("profiles")
      .select("account_id")
      .eq(
        "user_id",
        user.id,
      )
      .single()

  if (
    error ||
    !profile?.account_id
  ) {
    throw new Error(
      error?.message ??
        "Account not found.",
    )
  }

  return {
    accountId:
      profile.account_id as string,
  }
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string
    }>
  },
) {
  try {
    const account =
      await getAccount()

    if (!account) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        { status: 401 },
      )
    }

    const {
      id,
    } =
      await context.params

    const body =
      await request.json()

    if (
      body?.action !==
      "cancel"
    ) {
      return NextResponse.json(
        {
          error:
            "Unsupported broadcast action.",
        },
        { status: 400 },
      )
    }

    const admin =
      supabaseAdmin()

    const {
      data: broadcast,
      error,
    } =
      await admin
        .from(
          "broadcasts",
        )
        .select(
          "id,status",
        )
        .eq(
          "account_id",
          account.accountId,
        )
        .eq(
          "id",
          id,
        )
        .maybeSingle()

    if (error) {
      throw new Error(
        error.message,
      )
    }

    if (!broadcast) {
      return NextResponse.json(
        {
          error:
            "Broadcast not found.",
        },
        { status: 404 },
      )
    }

    if (
      !canCancelBroadcast(
        broadcast.status,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "This broadcast is no longer cancellable.",
        },
        { status: 409 },
      )
    }

    const now =
      new Date().toISOString()

    const {
      error:
        updateError,
    } =
      await admin
        .from(
          "broadcasts",
        )
        .update({
          status:
            "cancelled",
          cancelled_at:
            now,
          updated_at:
            now,
        })
        .eq(
          "account_id",
          account.accountId,
        )
        .eq(
          "id",
          id,
        )
        .in("status", [
          "draft",
          "scheduled",
          "sending",
        ])

    if (updateError) {
      throw new Error(
        updateError.message,
      )
    }

    await admin
      .from(
        "broadcast_recipients",
      )
      .update({
        status:
          "cancelled",
      })
      .eq(
        "broadcast_id",
        id,
      )
      .eq(
        "status",
        "pending",
      )

    return NextResponse.json({
      ok: true,
      status:
        "cancelled",
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to cancel broadcast.",
      },
      { status: 500 },
    )
  }
}
