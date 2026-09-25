import { NextResponse } from "next/server"

import {
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account"
import {
  canReleaseConversationLock,
  isConversationControlAction,
  isConversationLifecycleStatus,
} from "@/lib/conversations/control"
import { supabaseAdmin } from "@/lib/automations/admin-client"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const ctx = await requireRole("agent")
    const { id } = await context.params

    if (!id) {
      return NextResponse.json(
        { error: "Conversation id is required" },
        { status: 400 },
      )
    }

    const body = (await request.json().catch(() => null)) as {
      action?: unknown
      agent_id?: unknown
      status?: unknown
    } | null

    if (
      !body ||
      !isConversationControlAction(body.action)
    ) {
      return NextResponse.json(
        { error: "Invalid conversation control action" },
        { status: 400 },
      )
    }

    const admin = supabaseAdmin()

    const {
      data: conversation,
      error: fetchError,
    } = await admin
      .from("conversations")
      .select(
        "id,account_id,status,assigned_agent_id,control_mode,control_locked_by",
      )
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      )
    }

    const now = new Date().toISOString()

    const update: Record<string, unknown> = {
      updated_at: now,
    }

    switch (body.action) {
      case "handoff": {
        update.control_mode = "human"
        update.status = "pending"
        update.assigned_agent_id =
          ctx.userId
        update.control_locked_by =
          ctx.userId
        update.control_locked_at =
          now
        break
      }

      case "pause_ai": {
        update.control_mode = "paused"
        break
      }

      case "resume_ai": {
        if (conversation.status === "closed") {
          return NextResponse.json(
            {
              error:
                "Reopen the conversation before resuming AI",
            },
            { status: 409 },
          )
        }

        update.control_mode = "ai"
        break
      }

      case "claim": {
        if (
          conversation.control_locked_by &&
          conversation.control_locked_by !==
            ctx.userId
        ) {
          return NextResponse.json(
            {
              error:
                "Conversation is already claimed by another teammate",
            },
            { status: 409 },
          )
        }

        update.control_mode = "human"
        update.assigned_agent_id =
          ctx.userId
        update.control_locked_by =
          ctx.userId
        update.control_locked_at =
          now
        break
      }

      case "release": {
        const adminRole =
          ctx.role === "owner" ||
          ctx.role === "admin"

        if (
          !canReleaseConversationLock(
            conversation.control_locked_by,
            ctx.userId,
            adminRole,
          )
        ) {
          return NextResponse.json(
            {
              error:
                "Only the current owner or admin can release this claim",
            },
            { status: 403 },
          )
        }

        update.control_locked_by = null
        update.control_locked_at = null
        break
      }

      case "assign": {
        if (
          typeof body.agent_id !== "string" ||
          !body.agent_id.trim()
        ) {
          return NextResponse.json(
            { error: "agent_id is required" },
            { status: 400 },
          )
        }

        const {
          data: member,
          error: memberError,
        } = await admin
          .from("profiles")
          .select("user_id,account_role")
          .eq("account_id", ctx.accountId)
          .eq(
            "user_id",
            body.agent_id,
          )
          .maybeSingle()

        if (memberError) {
          throw memberError
        }

        if (!member) {
          return NextResponse.json(
            {
              error:
                "Selected teammate is not a member of this account",
            },
            { status: 400 },
          )
        }

        update.assigned_agent_id =
          body.agent_id
        break
      }

      case "unassign": {
        update.assigned_agent_id = null

        if (
          conversation.control_locked_by ===
          ctx.userId
        ) {
          update.control_locked_by = null
          update.control_locked_at = null
        }

        break
      }

      case "close": {
        update.status = "closed"
        update.closed_at = now
        update.closed_by = ctx.userId
        update.control_locked_by = null
        update.control_locked_at = null
        break
      }

      case "reopen": {
        if (conversation.status !== "closed") {
          return NextResponse.json(
            { error: "Conversation is already open" },
            { status: 409 },
          )
        }

        update.status = "open"
        update.closed_at = null
        update.closed_by = null
        break
      }

      case "set_status": {
        if (
          !isConversationLifecycleStatus(
            body.status,
          )
        ) {
          return NextResponse.json(
            {
              error:
                "status must be open, pending, or closed",
            },
            { status: 400 },
          )
        }

        update.status = body.status

        if (body.status === "closed") {
          update.closed_at = now
          update.closed_by = ctx.userId
          update.control_locked_by = null
          update.control_locked_at = null
        } else if (
          conversation.status ===
            "closed"
        ) {
          update.closed_at = null
          update.closed_by = null
        }

        break
      }

      default: {
        return NextResponse.json(
          { error: "Unsupported action" },
          { status: 400 },
        )
      }
    }

    const {
      data: updated,
      error: updateError,
    } = await admin
      .from("conversations")
      .update(update)
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .select(
        "id,status,assigned_agent_id,control_mode,control_locked_by,control_locked_at,closed_at,closed_by,updated_at",
      )
      .single()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      ok: true,
      conversation: updated,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
