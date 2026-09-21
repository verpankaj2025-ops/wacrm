
import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/automations/admin-client"
import {
  resolveServerAudience,
} from "@/lib/broadcasts/server-audience"
import {
  checkMetaTemplateAvailability,
  metaTemplateBroadcastError,
} from "@/lib/whatsapp/meta-template-availability"

async function getAccount() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile, error } =
    await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .single()

  if (
    error ||
    !profile?.account_id
  ) {
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

export async function POST(
  request: Request,
) {
  try {
    const account = await getAccount()

    if (!account) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      )
    }

    const body =
      await request.json()

    const name =
      String(
        body?.name ?? "",
      ).trim()

    const templateName =
      String(
        body?.template_name ?? "",
      ).trim()

    const templateLanguage =
      String(
        body?.template_language ??
          "en_US",
      ).trim() ||
      "en_US"

    const scheduledAt =
      String(
        body?.scheduled_at ?? "",
      )

    if (
      !name ||
      !templateName ||
      !scheduledAt
    ) {
      return NextResponse.json(
        {
          error:
            "Broadcast name, template and scheduled time are required.",
        },
        { status: 400 },
      )
    }

    const scheduleDate =
      new Date(
        scheduledAt,
      )

    if (
      Number.isNaN(
        scheduleDate.getTime(),
      ) ||
      scheduleDate.getTime() <=
        Date.now()
    ) {
      return NextResponse.json(
        {
          error:
            "Scheduled time must be a valid future time.",
        },
        { status: 400 },
      )
    }

    const admin =
      supabaseAdmin()

    const {
      data: whatsappConfig,
      error:
        whatsappConfigError,
    } =
      await admin
        .from("whatsapp_config")
        .select(
          "waba_id,access_token",
        )
        .eq(
          "account_id",
          account.accountId,
        )
        .maybeSingle()

    if (
      whatsappConfigError ||
      !whatsappConfig
    ) {
      throw new Error(
        whatsappConfigError?.message ??
          "WhatsApp is not configured.",
      )
    }

    if (
      !whatsappConfig.waba_id
    ) {
      throw new Error(
        "WABA ID is missing. Reconnect WhatsApp in Settings.",
      )
    }

    const accessToken =
      require("@/lib/whatsapp/encryption").decrypt(
        whatsappConfig.access_token,
      )

    const liveTemplate =
      await checkMetaTemplateAvailability({
        wabaId:
          whatsappConfig.waba_id,
        accessToken,
        name:
          templateName,
        language:
          templateLanguage,
      })

    const liveTemplateError =
      metaTemplateBroadcastError(
        templateName,
        templateLanguage,
        liveTemplate,
      )

    if (liveTemplateError) {
      return NextResponse.json(
        {
          error:
            liveTemplateError,
        },
        { status: 400 },
      )
    }

    const {
      data: template,
      error: templateError,
    } =
      await admin
        .from("message_templates")
        .select(
          "id,name,language,status",
        )
        .eq(
          "account_id",
          account.accountId,
        )
        .eq(
          "name",
          templateName,
        )
        .eq(
          "language",
          templateLanguage,
        )
        .eq(
          "status",
          "APPROVED",
        )
        .maybeSingle()

    if (templateError) {
      throw new Error(
        templateError.message,
      )
    }

    if (!template) {
      return NextResponse.json(
        {
          error:
            `Approved template "${templateName}" (${templateLanguage}) was not found.`,
        },
        { status: 400 },
      )
    }

    const contacts =
      await resolveServerAudience(
        account.accountId,
        account.userId,
        body.audience ?? {
          type: "all",
        },
      )

    if (!contacts.length) {
      return NextResponse.json(
        {
          error:
            "No contacts matched the selected audience.",
        },
        { status: 400 },
      )
    }

    const {
      data: broadcast,
      error: broadcastError,
    } =
      await admin
        .from("broadcasts")
        .insert({
          user_id:
            account.userId,
          account_id:
            account.accountId,
          name,
          template_name:
            templateName,
          template_language:
            templateLanguage,
          template_variables:
            body.variables ?? {},
          audience_filter:
            body.audience ?? {
              type: "all",
            },
          scheduled_at:
            scheduleDate.toISOString(),
          status:
            "scheduled",
          total_recipients:
            contacts.length,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          replied_count: 0,
          failed_count: 0,
        })
        .select("id")
        .single()

    if (
      broadcastError ||
      !broadcast
    ) {
      throw new Error(
        broadcastError?.message ??
          "Failed to create scheduled broadcast.",
      )
    }

    for (
      let i = 0;
      i < contacts.length;
      i += 200
    ) {
      const chunk =
        contacts
          .slice(
            i,
            i + 200,
          )
          .map(
            (contact) => ({
              broadcast_id:
                broadcast.id,
              contact_id:
                contact.id,
              status:
                "pending",
            }),
          )

      const {
        error:
          recipientError,
      } =
        await admin
          .from(
            "broadcast_recipients",
          )
          .insert(
            chunk,
          )

      if (recipientError) {
        await admin
          .from("broadcasts")
          .update({
            status:
              "failed",
          })
          .eq(
            "id",
            broadcast.id,
          )

        throw new Error(
          recipientError.message,
        )
      }
    }

    return NextResponse.json(
      {
        ok: true,
        broadcast_id:
          broadcast.id,
        scheduled_at:
          scheduleDate.toISOString(),
        total_recipients:
          contacts.length,
      },
      { status: 201 },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to schedule broadcast.",
      },
      { status: 500 },
    )
  }
}
