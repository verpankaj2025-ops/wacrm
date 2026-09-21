import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/automations/admin-client"
import {
  sendTextMessage,
  sendTemplateMessage,
} from "@/lib/whatsapp/meta-api"
import { decrypt } from "@/lib/whatsapp/encryption"
import { isMessageTemplate } from "@/lib/whatsapp/template-row-guard"
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from "@/lib/whatsapp/phone-utils"
import { isWithinCustomerServiceWindow } from "@/lib/automations/customer-window"
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit"

type BulkAction =
  | "freeform"
  | "template"
  | "pause"
  | "resume"
  | "cancel"
  | "reschedule"

async function getAccount() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  const { data: profile, error } =
    await supabase
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
    userId: user.id,
    accountId: profile.account_id as string,
  }
}

function parseDate(value: unknown) {
  const date = new Date(String(value ?? ""))

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid schedule time.")
  }

  return date.toISOString()
}

async function getLatestCustomerMessages(
  accountId: string,
  contactIds: string[],
) {
  const admin = supabaseAdmin()

  const { data: conversations, error: conversationError } =
    contactIds.length
      ? await admin
          .from("conversations")
          .select("id,contact_id,created_at")
          .eq("account_id", accountId)
          .in("contact_id", contactIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null }

  if (conversationError) {
    throw new Error(conversationError.message)
  }

  const conversationByContact = new Map<
    string,
    { id: string; contact_id: string }
  >()

  for (const conversation of conversations ?? []) {
    if (!conversationByContact.has(conversation.contact_id)) {
      conversationByContact.set(
        conversation.contact_id,
        conversation,
      )
    }
  }

  const conversationIds = [
    ...new Set(
      [...conversationByContact.values()].map(
        (conversation) => conversation.id,
      ),
    ),
  ]

  const { data: messages, error: messageError } =
    conversationIds.length
      ? await admin
          .from("messages")
          .select(
            "conversation_id,created_at,sender_type",
          )
          .in("conversation_id", conversationIds)
          .eq("sender_type", "customer")
          .order("created_at", {
            ascending: false,
          })
      : { data: [], error: null }

  if (messageError) {
    throw new Error(messageError.message)
  }

  const latestByConversation = new Map<
    string,
    string
  >()

  for (const message of messages ?? []) {
    if (
      !latestByConversation.has(
        message.conversation_id,
      )
    ) {
      latestByConversation.set(
        message.conversation_id,
        message.created_at,
      )
    }
  }

  const result = new Map<
    string,
    string | null
  >()

  for (const contactId of contactIds) {
    const conversation =
      conversationByContact.get(contactId)

    result.set(
      contactId,
      conversation
        ? latestByConversation.get(
            conversation.id,
          ) ?? null
        : null,
    )
  }

  return result
}

async function sendBulkText(
  accountId: string,
  contactIds: string[],
  text: string,
) {
  const admin = supabaseAdmin()

  const { data: config, error: configError } =
    await admin
      .from("whatsapp_config")
      .select("*")
      .eq("account_id", accountId)
      .single()

  if (configError || !config) {
    throw new Error(
      "WhatsApp is not configured.",
    )
  }

  const accessToken = decrypt(
    config.access_token,
  )

  const { data: contacts, error: contactError } =
    await admin
      .from("contacts")
      .select("id,name,phone")
      .eq("account_id", accountId)
      .in("id", contactIds)

  if (contactError) {
    throw new Error(contactError.message)
  }

  const contactMap = new Map(
    (contacts ?? []).map(
      (contact) => [
        contact.id,
        contact,
      ],
    ),
  )

  const { data: conversations, error: conversationError } =
    await admin
      .from("conversations")
      .select("id,contact_id")
      .eq("account_id", accountId)
      .in("contact_id", contactIds)
      .order("created_at", {
        ascending: false,
      })

  if (conversationError) {
    throw new Error(
      conversationError.message,
    )
  }

  const conversationMap = new Map<
    string,
    string
  >()

  for (const conversation of conversations ?? []) {
    if (
      !conversationMap.has(
        conversation.contact_id,
      )
    ) {
      conversationMap.set(
        conversation.contact_id,
        conversation.id,
      )
    }
  }

  const latestMessages =
    await getLatestCustomerMessages(
      accountId,
      contactIds,
    )

  const results: Array<{
    contact_id: string
    phone: string
    status: "sent" | "failed" | "blocked"
    reason?: string
  }> = []

  for (const contactId of contactIds) {
    const contact = contactMap.get(contactId)
    const conversationId =
      conversationMap.get(contactId)

    if (!contact || !conversationId) {
      results.push({
        contact_id: contactId,
        phone: contact?.phone ?? "",
        status: "failed",
        reason:
          "Conversation not found.",
      })
      continue
    }

    if (
      !isWithinCustomerServiceWindow(
        latestMessages.get(contactId),
      )
    ) {
      results.push({
        contact_id: contactId,
        phone: contact.phone,
        status: "blocked",
        reason:
          "WhatsApp 24-hour window is closed. Use an approved template.",
      })
      continue
    }

    const sanitized =
      sanitizePhoneForMeta(
        contact.phone,
      )

    if (!isValidE164(sanitized)) {
      results.push({
        contact_id: contactId,
        phone: contact.phone,
        status: "failed",
        reason:
          "Invalid phone number format.",
      })
      continue
    }

    const personalisedText =
      text.replaceAll(
        "{{name}}",
        contact.name?.trim() ||
          "there",
      )

    let whatsappMessageId = ""

    for (const variant of phoneVariants(
      sanitized,
    )) {
      try {
        const sent =
          await sendTextMessage({
            phoneNumberId:
              config.phone_number_id,
            accessToken,
            to: variant,
            text: personalisedText,
          })

        whatsappMessageId =
          sent.messageId

        break
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error)

        if (
          !isRecipientNotAllowedError(
            message,
          )
        ) {
          break
        }
      }
    }

    if (!whatsappMessageId) {
      results.push({
        contact_id: contactId,
        phone: contact.phone,
        status: "failed",
        reason:
          "WhatsApp send failed.",
      })
      continue
    }

    const { error: messageInsertError } =
      await admin
        .from("messages")
        .insert({
          conversation_id:
            conversationId,
          sender_type: "agent",
          content_type: "text",
          content_text:
            personalisedText,
          media_url: null,
          template_name: null,
          message_id:
            whatsappMessageId,
          status: "sent",
        })

    if (messageInsertError) {
      results.push({
        contact_id: contactId,
        phone: contact.phone,
        status: "failed",
        reason:
          "Message sent to WhatsApp but could not be saved in CRM.",
      })
      continue
    }

    await admin
      .from("conversations")
      .update({
        last_message_text:
          personalisedText,
        last_message_at:
          new Date().toISOString(),
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", conversationId)

    results.push({
      contact_id: contactId,
      phone: contact.phone,
      status: "sent",
    })
  }

  return results
}

async function sendBulkTemplate(
  accountId: string,
  contactIds: string[],
  templateName: string,
  templateLanguage: string,
) {
  const admin = supabaseAdmin()

  const { data: config, error: configError } =
    await admin
      .from("whatsapp_config")
      .select("*")
      .eq("account_id", accountId)
      .single()

  if (configError || !config) {
    throw new Error(
      "WhatsApp is not configured.",
    )
  }

  const accessToken = decrypt(
    config.access_token,
  )

  const {
    data: rawTemplate,
    error: templateError,
  } = await admin
    .from("message_templates")
    .select("*")
    .eq("account_id", accountId)
    .eq("name", templateName)
    .eq(
      "language",
      templateLanguage,
    )
    .eq("status", "APPROVED")
    .maybeSingle()

  if (templateError) {
    throw new Error(
      templateError.message,
    )
  }

  if (
    !rawTemplate ||
    !isMessageTemplate(rawTemplate)
  ) {
    throw new Error(
      `Approved template "${templateName}" (${templateLanguage}) was not found.`,
    )
  }

  const { data: contacts, error: contactError } =
    await admin
      .from("contacts")
      .select("id,name,phone")
      .eq("account_id", accountId)
      .in("id", contactIds)

  if (contactError) {
    throw new Error(contactError.message)
  }

  const { data: conversations, error: conversationError } =
    await admin
      .from("conversations")
      .select("id,contact_id")
      .eq("account_id", accountId)
      .in("contact_id", contactIds)
      .order("created_at", {
        ascending: false,
      })

  if (conversationError) {
    throw new Error(
      conversationError.message,
    )
  }

  const conversationMap = new Map<
    string,
    string
  >()

  for (const conversation of conversations ?? []) {
    if (
      !conversationMap.has(
        conversation.contact_id,
      )
    ) {
      conversationMap.set(
        conversation.contact_id,
        conversation.id,
      )
    }
  }

  const results: Array<{
    contact_id: string
    phone: string
    status: "sent" | "failed"
    reason?: string
  }> = []

  for (const contact of contacts ?? []) {
    const conversationId =
      conversationMap.get(
        contact.id,
      )

    if (!conversationId) {
      results.push({
        contact_id: contact.id,
        phone: contact.phone,
        status: "failed",
        reason:
          "Conversation not found.",
      })
      continue
    }

    const sanitized =
      sanitizePhoneForMeta(
        contact.phone,
      )

    if (!isValidE164(sanitized)) {
      results.push({
        contact_id: contact.id,
        phone: contact.phone,
        status: "failed",
        reason:
          "Invalid phone number format.",
      })
      continue
    }

    let sentMessageId = ""

    for (const variant of phoneVariants(
      sanitized,
    )) {
      try {
        const sent =
          await sendTemplateMessage({
            phoneNumberId:
              config.phone_number_id,
            accessToken,
            to: variant,
            templateName,
            language:
              templateLanguage,
            template:
              rawTemplate,
            params: [],
          })

        sentMessageId =
          sent.messageId

        break
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error)

        if (
          !isRecipientNotAllowedError(
            message,
          )
        ) {
          break
        }
      }
    }

    if (!sentMessageId) {
      results.push({
        contact_id: contact.id,
        phone: contact.phone,
        status: "failed",
        reason:
          "WhatsApp template send failed.",
      })
      continue
    }

    await admin
      .from("messages")
      .insert({
        conversation_id:
          conversationId,
        sender_type:
          "agent",
        content_type:
          "template",
        content_text:
          null,
        media_url:
          null,
        template_name:
          templateName,
        message_id:
          sentMessageId,
        status:
          "sent",
      })

    await admin
      .from("conversations")
      .update({
        last_message_text:
          `[${templateName}]`,
        last_message_at:
          new Date().toISOString(),
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", conversationId)

    results.push({
      contact_id: contact.id,
      phone: contact.phone,
      status: "sent",
    })
  }

  return results
}

async function pauseEnrollment(
  admin: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  enrollmentId: string,
) {
  const now =
    new Date().toISOString()

  const { data: pending } =
    await admin
      .from("automation_pending_executions")
      .select("id")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .contains("context", {
        enrollment_id:
          enrollmentId,
      })
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle()

  if (pending) {
    await admin
      .from(
        "automation_pending_executions",
      )
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancel_reason:
          "manual_pause",
      })
      .eq("id", pending.id)
  }

  await admin
    .from("automation_enrollments")
    .update({
      status: "paused",
      paused_at: now,
      updated_at: now,
    })
    .eq("account_id", accountId)
    .eq("id", enrollmentId)
}

async function cancelEnrollment(
  admin: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  enrollmentId: string,
) {
  const now =
    new Date().toISOString()

  const { data: pending } =
    await admin
      .from("automation_pending_executions")
      .select("id")
      .eq("account_id", accountId)
      .eq("status", "pending")
      .contains("context", {
        enrollment_id:
          enrollmentId,
      })
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle()

  if (pending) {
    await admin
      .from(
        "automation_pending_executions",
      )
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancel_reason:
          "manual_cancel",
      })
      .eq("id", pending.id)
  }

  await admin
    .from("automation_enrollments")
    .update({
      status: "cancelled",
      cancelled_at: now,
      error_message:
        "manual_cancel",
      updated_at: now,
    })
    .eq("account_id", accountId)
    .eq("id", enrollmentId)
}

export async function POST(
  request: Request,
) {
  try {
    const {
      userId,
      accountId,
    } = await getAccount()

    const limit =
      checkRateLimit(
        `bulk-followup:${userId}`,
        RATE_LIMITS.broadcast,
      )

    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const body =
      await request.json()

    const ids = [
      ...new Set(
        Array.isArray(
          body?.enrollment_ids,
        )
          ? body.enrollment_ids
              .map((id: unknown) =>
                String(id),
              )
              .filter(Boolean)
          : [],
      ),
    ]

    const action =
      body?.action as BulkAction

    if (
      ids.length === 0 ||
      ids.length > 500
    ) {
      return NextResponse.json(
        {
          error:
            "Select between 1 and 500 follow-up leads.",
        },
        { status: 400 },
      )
    }

    const admin =
      supabaseAdmin()

    const {
      data: enrollments,
      error: enrollmentError,
    } =
      await admin
        .from("automation_enrollments")
        .select(
          "id,contact_id,status",
        )
        .eq(
          "account_id",
          accountId,
        )
        .in(
          "id",
          ids,
        )

    if (enrollmentError) {
      throw new Error(
        enrollmentError.message,
      )
    }

    if (
      (enrollments ?? []).length !==
      ids.length
    ) {
      return NextResponse.json(
        {
          error:
            "One or more selected follow-ups do not belong to this account.",
        },
        { status: 403 },
      )
    }

    if (
      action === "freeform"
    ) {
      const text =
        typeof body?.text ===
        "string"
          ? body.text.trim()
          : ""

      if (!text) {
        return NextResponse.json(
          {
            error:
              "Free-form message is required.",
          },
          { status: 400 },
        )
      }

      const results =
        await sendBulkText(
          accountId,
          (enrollments ?? []).map(
            (row) =>
              row.contact_id,
          ),
          text,
        )

      return NextResponse.json({
        ok: true,
        action,
        total: results.length,
        sent: results.filter(
          (row) =>
            row.status === "sent",
        ).length,
        blocked: results.filter(
          (row) =>
            row.status === "blocked",
        ).length,
        failed: results.filter(
          (row) =>
            row.status === "failed",
        ).length,
        results,
      })
    }

    if (
      action === "template"
    ) {
      const templateName =
        String(
          body?.template_name ??
            "",
        ).trim()

      const language =
        String(
          body?.template_language ??
            "en_US",
        ).trim() ||
        "en_US"

      if (!templateName) {
        return NextResponse.json(
          {
            error:
              "Approved template is required.",
          },
          { status: 400 },
        )
      }

      const results =
        await sendBulkTemplate(
          accountId,
          (enrollments ?? []).map(
            (row) =>
              row.contact_id,
          ),
          templateName,
          language,
        )

      return NextResponse.json({
        ok: true,
        action,
        total: results.length,
        sent: results.filter(
          (row) =>
            row.status === "sent",
        ).length,
        failed: results.filter(
          (row) =>
            row.status === "failed",
        ).length,
        results,
      })
    }

    if (
      action === "pause" ||
      action === "cancel"
    ) {
      let updated = 0

      for (const enrollment of
        enrollments ?? []) {
        if (
          action === "pause"
        ) {
          await pauseEnrollment(
            admin,
            accountId,
            enrollment.id,
          )
        } else {
          await cancelEnrollment(
            admin,
            accountId,
            enrollment.id,
          )
        }

        updated++
      }

      return NextResponse.json({
        ok: true,
        action,
        updated,
      })
    }

    if (
      action === "resume"
    ) {
      let updated = 0

      for (const enrollment of
        enrollments ?? []) {
        const {
          data: checkpoint,
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
                  enrollment.id,
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

        if (!checkpoint) {
          continue
        }

        const runAt =
          enrollment.status ===
          "paused"
            ? new Date(
                Date.now() +
                  60_000,
              ).toISOString()
            : new Date().toISOString()

        await admin
          .from(
            "automation_pending_executions",
          )
          .update({
            status:
              "pending",
            run_at:
              runAt,
            started_at: null,
            cancelled_at:
              null,
            cancel_reason:
              null,
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
            status:
              "pending",
            paused_at:
              null,
            next_run_at:
              runAt,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "account_id",
            accountId,
          )
          .eq(
            "id",
            enrollment.id,
          )

        updated++
      }

      return NextResponse.json({
        ok: true,
        action,
        updated,
      })
    }

    if (
      action === "reschedule"
    ) {
      const runAt =
        parseDate(
          body?.run_at,
        )

      let updated = 0

      for (const enrollment of
        enrollments ?? []) {
        const {
          data: pending,
        } =
          await admin
            .from(
              "automation_pending_executions",
            )
            .select("id")
            .eq(
              "account_id",
              accountId,
            )
            .eq(
              "status",
              "pending",
            )
            .contains(
              "context",
              {
                enrollment_id:
                  enrollment.id,
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

        if (!pending) {
          continue
        }

        await admin
          .from(
            "automation_pending_executions",
          )
          .update({
            status:
              "pending",
            run_at:
              runAt,
            started_at:
              null,
            cancelled_at:
              null,
            cancel_reason:
              null,
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
            status:
              "pending",
            next_run_at:
              runAt,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "account_id",
            accountId,
          )
          .eq(
            "id",
            enrollment.id,
          )

        updated++
      }

      return NextResponse.json({
        ok: true,
        action,
        updated,
        run_at: runAt,
      })
    }

    return NextResponse.json(
      {
        error:
          "Unsupported bulk action.",
      },
      { status: 400 },
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Bulk follow-up action failed"

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
