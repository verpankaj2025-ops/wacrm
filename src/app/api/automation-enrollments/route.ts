import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/automations/admin-client"

type Action =
  | "pause"
  | "resume"
  | "cancel"
  | "reschedule"
  | "change_sequence"

async function getAccountId() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .single()

  if (error || !profile?.account_id) {
    throw new Error(
      error?.message ??
        "Your profile is not linked to an account.",
    )
  }

  return {
    accountId: profile.account_id,
  }
}

function parseSchedule(
  value: unknown,
) {
  const date = new Date(
    String(value ?? ""),
  )

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid schedule time.")
  }

  return date.toISOString()
}

async function findPending(
  admin: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  enrollmentId: string,
) {
  const { data, error } = await admin
    .from("automation_pending_executions")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .contains("context", {
      enrollment_id: enrollmentId,
    })
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function GET(
  request: Request,
) {
  try {
    const { accountId } = await getAccountId()
    const admin = supabaseAdmin()

    const url = new URL(request.url)

    const limit = Math.min(
      500,
      Math.max(
        1,
        Number(
          url.searchParams.get("limit") ??
            200,
        ),
      ),
    )

    const {
      data: enrollments,
      error: enrollmentError,
    } = await admin
      .from("automation_enrollments")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", {
        ascending: false,
      })
      .limit(limit)

    if (enrollmentError) {
      throw new Error(
        enrollmentError.message,
      )
    }

    const rows = enrollments ?? []

    const contactIds = [
      ...new Set(
        rows.map(
          (row) => row.contact_id,
        ),
      ),
    ]

    const automationIds = [
      ...new Set(
        rows.map(
          (row) => row.automation_id,
        ),
      ),
    ]

    const contacts =
      contactIds.length > 0
        ? await admin
            .from("contacts")
            .select("id,name,phone")
            .eq(
              "account_id",
              accountId,
            )
            .in("id", contactIds)
        : {
            data: [],
            error: null,
          }

    const automations =
      automationIds.length > 0
        ? await admin
            .from("automations")
            .select(
              "id,name,is_active",
            )
            .eq(
              "account_id",
              accountId,
            )
            .in(
              "id",
              automationIds,
            )
        : {
            data: [],
            error: null,
          }

    const sequences =
      await admin
        .from("automations")
        .select(
          "id,name,is_active",
        )
        .eq(
          "account_id",
          accountId,
        )
        .order("name")

    const pending =
      await admin
        .from(
          "automation_pending_executions",
        )
        .select(
          "id,automation_id,contact_id,status,run_at,next_step_position,context,created_at",
        )
        .eq(
          "account_id",
          accountId,
        )
        .eq(
          "status",
          "pending",
        )
        .order("run_at", {
          ascending: true,
        })
        .limit(1000)

    if (contacts.error) {
      throw new Error(
        contacts.error.message,
      )
    }

    if (automations.error) {
      throw new Error(
        automations.error.message,
      )
    }

    if (sequences.error) {
      throw new Error(
        sequences.error.message,
      )
    }

    if (pending.error) {
      throw new Error(
        pending.error.message,
      )
    }

    const contactMap =
      new Map(
        (contacts.data ?? []).map(
          (row) => [
            row.id,
            row,
          ],
        ),
      )

    const automationMap =
      new Map(
        (automations.data ?? []).map(
          (row) => [
            row.id,
            row,
          ],
        ),
      )

    const pendingMap =
      new Map<
        string,
        Record<string, unknown>
      >()

    for (
      const row of
        pending.data ?? []
    ) {
      const context =
        (row.context ??
          {}) as Record<
          string,
          unknown
        >

      const enrollmentId =
        String(
          context.enrollment_id ??
            "",
        )

      if (
        enrollmentId &&
        !pendingMap.has(
          enrollmentId,
        )
      ) {
        pendingMap.set(
          enrollmentId,
          row as Record<
            string,
            unknown
          >,
        )
      }
    }

    // Resolve each contact's latest customer message so the
    // Follow-up Leads UI can safely show whether the WhatsApp
    // 24-hour customer-service window is open.
    const conversationRows =
      contactIds.length > 0
        ? await admin
            .from("conversations")
            .select(
              "id,contact_id,created_at",
            )
            .eq(
              "account_id",
              accountId,
            )
            .in(
              "contact_id",
              contactIds,
            )
            .order(
              "created_at",
              {
                ascending: false,
              },
            )
        : {
            data: [],
            error: null,
          }

    if (conversationRows.error) {
      throw new Error(
        conversationRows.error.message,
      )
    }

    const conversationByContact =
      new Map<
        string,
        string
      >()

    for (
      const row of
        conversationRows.data ?? []
    ) {
      if (
        !conversationByContact.has(
          row.contact_id,
        )
      ) {
        conversationByContact.set(
          row.contact_id,
          row.id,
        )
      }
    }

    const conversationIds = [
      ...new Set(
        [
          ...conversationByContact.values(),
        ],
      ),
    ]

    const customerMessages =
      conversationIds.length > 0
        ? await admin
            .from("messages")
            .select(
              "conversation_id,created_at",
            )
            .in(
              "conversation_id",
              conversationIds,
            )
            .eq(
              "sender_type",
              "customer",
            )
            .order(
              "created_at",
              {
                ascending: false,
              },
            )
        : {
            data: [],
            error: null,
          }

    if (customerMessages.error) {
      throw new Error(
        customerMessages.error.message,
      )
    }

    const latestCustomerMessage =
      new Map<
        string,
        string
      >()

    for (
      const message of
        customerMessages.data ?? []
    ) {
      if (
        !latestCustomerMessage.has(
          message.conversation_id,
        )
      ) {
        latestCustomerMessage.set(
          message.conversation_id,
          message.created_at,
        )
      }
    }

    const customerWindowMs =
      24 * 60 * 60 * 1000

    return NextResponse.json({
      enrollments:
        rows.map(
          (row) => {
            const conversationId =
              conversationByContact.get(
                row.contact_id,
              ) ?? null

            const lastCustomerMessageAt =
              conversationId
                ? latestCustomerMessage.get(
                    conversationId,
                  ) ?? null
                : null

            const lastCustomerMessageMs =
              lastCustomerMessageAt
                ? new Date(
                    lastCustomerMessageAt,
                  ).getTime()
                : Number.NaN

            const ageMs =
              Number.isFinite(
                lastCustomerMessageMs,
              )
                ? Date.now() -
                  lastCustomerMessageMs
                : Number.POSITIVE_INFINITY

            const windowOpen =
              Number.isFinite(
                lastCustomerMessageMs,
              ) &&
              ageMs >= 0 &&
              ageMs < customerWindowMs

            const hoursRemaining =
              windowOpen
                ? Math.max(
                    0,
                    (customerWindowMs -
                      ageMs) /
                      (60 *
                        60 *
                        1000),
                  )
                : 0

            return {
              ...row,
              contact:
                contactMap.get(
                  row.contact_id,
                ) ?? null,
              automation:
                automationMap.get(
                  row.automation_id,
                ) ?? null,
              pending:
                pendingMap.get(
                  row.id,
                ) ?? null,
              last_customer_message_at:
                lastCustomerMessageAt,
              window_open:
                windowOpen,
              hours_remaining:
                Number(
                  hoursRemaining.toFixed(
                    2,
                  ),
                ),
            }
          },
        ),
      sequences:
        sequences.data ?? [],
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load follow-ups"

    return NextResponse.json(
      { error: message },
      {
        status:
          message === "Unauthorized"
            ? 401
            : 500,
      },
    )
  }
}

export async function PATCH(
  request: Request,
) {
  try {
    const { accountId } =
      await getAccountId()

    const body =
      await request.json()

    const enrollmentId =
      String(
        body?.enrollment_id ??
          "",
      ).trim()

    const action =
      body?.action as Action

    if (
      !enrollmentId ||
      !action
    ) {
      return NextResponse.json(
        {
          error:
            "enrollment_id and action are required.",
        },
        {
          status: 400,
        },
      )
    }

    const admin =
      supabaseAdmin()

    const {
      data: enrollment,
      error,
    } = await admin
      .from("automation_enrollments")
      .select("*")
      .eq("id", enrollmentId)
      .eq(
        "account_id",
        accountId,
      )
      .single()

    if (error || !enrollment) {
      return NextResponse.json(
        {
          error:
            "Follow-up enrollment not found.",
        },
        {
          status: 404,
        },
      )
    }

    const pending =
      await findPending(
        admin,
        accountId,
        enrollmentId,
      )

    const now =
      new Date().toISOString()

    if (action === "pause") {
      if (
        ![
          "pending",
          "running",
        ].includes(
          enrollment.status,
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Only active follow-ups can be paused.",
          },
          {
            status: 400,
          },
        )
      }

      if (pending) {
        await admin
          .from(
            "automation_pending_executions",
          )
          .update({
            status:
              "cancelled",
            cancelled_at:
              now,
            cancel_reason:
              "manual_pause",
          })
          .eq(
            "id",
            pending.id,
          )
      }

      await admin
        .from(
          "automation_enrollments",
        )
        .update({
          status: "paused",
          paused_at: now,
          updated_at: now,
        })
        .eq(
          "id",
          enrollmentId,
        )

      return NextResponse.json({
        ok: true,
        status: "paused",
      })
    }

    if (action === "cancel") {
      if (pending) {
        await admin
          .from(
            "automation_pending_executions",
          )
          .update({
            status:
              "cancelled",
            cancelled_at:
              now,
            cancel_reason:
              "manual_cancel",
          })
          .eq(
            "id",
            pending.id,
          )
      }

      await admin
        .from(
          "automation_enrollments",
        )
        .update({
          status: "cancelled",
          cancelled_at: now,
          error_message:
            "manual_cancel",
          updated_at: now,
        })
        .eq(
          "id",
          enrollmentId,
        )

      return NextResponse.json({
        ok: true,
        status: "cancelled",
      })
    }

    if (
      action === "reschedule"
    ) {
      const runAt =
        parseSchedule(
          body?.run_at,
        )

      if (!pending) {
        return NextResponse.json(
          {
            error:
              "No pending follow-up checkpoint is available.",
          },
          {
            status: 400,
          },
        )
      }

      await admin
        .from(
          "automation_pending_executions",
        )
        .update({
          status: "pending",
          run_at: runAt,
          started_at: null,
          cancelled_at: null,
          cancel_reason: null,
        })
        .eq(
          "id",
          pending.id,
        )

      await admin
        .from(
          "automation_enrollments",
        )
        .update({
          status: "pending",
          next_run_at:
            runAt,
          updated_at: now,
        })
        .eq(
          "id",
          enrollmentId,
        )

      return NextResponse.json({
        ok: true,
        status: "pending",
        next_run_at: runAt,
      })
    }

    if (
      action === "resume"
    ) {
      if (
        enrollment.status !==
        "paused"
      ) {
        return NextResponse.json(
          {
            error:
              "Only paused follow-ups can be resumed.",
          },
          {
            status: 400,
          },
        )
      }

      const {
        data:
          checkpoint,
        error:
          checkpointError,
      } =
        await admin
          .from(
            "automation_pending_executions",
          )
          .select("*")
          .eq(
            "account_id",
            accountId,
          )
          .eq(
            "status",
            "cancelled",
          )
          .eq(
            "cancel_reason",
            "manual_pause",
          )
          .contains(
            "context",
            {
              enrollment_id:
                enrollmentId,
            },
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            },
          )
          .limit(1)
          .maybeSingle()

      if (checkpointError) {
        throw new Error(
          checkpointError.message,
        )
      }

      if (!checkpoint) {
        return NextResponse.json(
          {
            error:
              "No pause checkpoint is available.",
          },
          {
            status: 400,
          },
        )
      }

      const runAt =
        body?.run_at
          ? parseSchedule(
              body.run_at,
            )
          : enrollment.next_run_at ??
            now

      await admin
        .from(
          "automation_pending_executions",
        )
        .update({
          status: "pending",
          run_at: runAt,
          started_at: null,
          cancelled_at: null,
          cancel_reason: null,
        })
        .eq(
          "id",
          checkpoint.id,
        )

      await admin
        .from(
          "automation_enrollments",
        )
        .update({
          status: "pending",
          paused_at: null,
          next_run_at: runAt,
          updated_at: now,
        })
        .eq(
          "id",
          enrollmentId,
        )

      return NextResponse.json({
        ok: true,
        status: "pending",
        next_run_at: runAt,
      })
    }

    if (
      action ===
      "change_sequence"
    ) {
      const automationId =
        String(
          body?.automation_id ??
            "",
        ).trim()

      if (!automationId) {
        return NextResponse.json(
          {
            error:
              "automation_id is required.",
          },
          {
            status: 400,
          },
        )
      }

      const {
        data: automation,
        error:
          automationError,
      } =
        await admin
          .from("automations")
          .select(
            "id,name,is_active,user_id,account_id",
          )
          .eq(
            "id",
            automationId,
          )
          .eq(
            "account_id",
            accountId,
          )
          .single()

      if (
        automationError ||
        !automation
      ) {
        return NextResponse.json(
          {
            error:
              "Sequence not found.",
          },
          {
            status: 404,
          },
        )
      }

      if (
        !automation.is_active
      ) {
        return NextResponse.json(
          {
            error:
              "The selected sequence is not active.",
          },
          {
            status: 400,
          },
        )
      }

      const {
        data: conversation,
      } =
        await admin
          .from(
            "conversations",
          )
          .select("id")
          .eq(
            "account_id",
            accountId,
          )
          .eq(
            "contact_id",
            enrollment.contact_id,
          )
          .order(
            "created_at",
            {
              ascending: false,
            },
          )
          .limit(1)
          .maybeSingle()

      if (!conversation) {
        return NextResponse.json(
          {
            error:
              "Conversation not found for this lead.",
          },
          {
            status: 400,
          },
        )
      }

      if (pending) {
        await admin
          .from(
            "automation_pending_executions",
          )
          .update({
            status:
              "cancelled",
            cancelled_at:
              now,
            cancel_reason:
              "sequence_changed",
          })
          .eq(
            "id",
            pending.id,
          )
      }

      const runAt =
        body?.run_at
          ? parseSchedule(
              body.run_at,
            )
          : now

      const {
        error:
          pendingError,
      } =
        await admin
          .from(
            "automation_pending_executions",
          )
          .insert({
            automation_id:
              automation.id,
            account_id:
              accountId,
            user_id:
              automation.user_id,
            contact_id:
              enrollment.contact_id,
            log_id: null,
            parent_step_id: null,
            branch: null,
            next_step_position: 0,
            context: {
              conversation_id:
                conversation.id,
              enrollment_id:
                enrollmentId,
              automation_started_at:
                runAt,
            },
            run_at: runAt,
            status: "pending",
            cancel_on_customer_reply:
              true,
          })

      if (pendingError) {
        throw new Error(
          pendingError.message,
        )
      }

      await admin
        .from(
          "automation_enrollments",
        )
        .update({
          automation_id:
            automation.id,
          status: "pending",
          current_step_position: 0,
          next_run_at: runAt,
          paused_at: null,
          cancelled_at: null,
          error_message: null,
          updated_at: now,
        })
        .eq(
          "id",
          enrollmentId,
        )

      return NextResponse.json({
        ok: true,
        status: "pending",
        next_run_at: runAt,
      })
    }

    return NextResponse.json(
      {
        error:
          "Unsupported action.",
      },
      {
        status: 400,
      },
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Follow-up update failed"

    return NextResponse.json(
      { error: message },
      {
        status:
          message === "Unauthorized"
            ? 401
            : 500,
      },
    )
  }
}
