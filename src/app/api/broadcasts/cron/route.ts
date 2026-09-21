
import { NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/automations/admin-client"
import { decrypt } from "@/lib/whatsapp/encryption"
import {
  sendTemplateMessage,
} from "@/lib/whatsapp/meta-api"
import {
  isMessageTemplate,
} from "@/lib/whatsapp/template-row-guard"
import {
  isRecipientNotAllowedError,
  isValidE164,
  phoneVariants,
  sanitizePhoneForMeta,
} from "@/lib/whatsapp/phone-utils"
import {
  resolveTemplateParams,
} from "@/lib/broadcasts/server-audience"

function authorized(
  request: Request,
) {
  const secret =
    process.env.CRON_SECRET

  if (!secret) return false

  return (
    request.headers.get(
      "authorization",
    ) ===
    `Bearer ${secret}`
  )
}

const sleep = (
  ms: number,
) =>
  new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms,
      ),
  )

export async function GET(
  request: Request,
) {
  if (!authorized(request)) {
    return NextResponse.json(
      {
        error:
          "Unauthorized scheduler request.",
      },
      { status: 401 },
    )
  }

  const admin =
    supabaseAdmin()

  const now =
    new Date().toISOString()

  const {
    data: broadcasts,
    error,
  } =
    await admin
      .from("broadcasts")
      .select("*")
      .eq(
        "status",
        "scheduled",
      )
      .lte(
        "scheduled_at",
        now,
      )
      .order(
        "scheduled_at",
        {
          ascending: true,
        },
      )
      .limit(10)

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      { status: 500 },
    )
  }

  const results = []

  for (
    const broadcast of
      broadcasts ?? []
  ) {
    const {
      data: claimed,
      error:
        claimError,
    } =
      await admin
        .from(
          "broadcasts",
        )
        .update({
          status:
            "sending",
          started_at:
            new Date().toISOString(),
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          broadcast.id,
        )
        .eq(
          "status",
          "scheduled",
        )
        .select("id")
        .maybeSingle()

    if (
      claimError ||
      !claimed
    ) {
      continue
    }

    try {
      const {
        data: template,
        error:
          templateError,
      } =
        await admin
          .from(
            "message_templates",
          )
          .select("*")
          .eq(
            "account_id",
            broadcast.account_id,
          )
          .eq(
            "name",
            broadcast.template_name,
          )
          .eq(
            "language",
            broadcast.template_language,
          )
          .eq(
            "status",
            "APPROVED",
          )
          .maybeSingle()

      if (
        templateError ||
        !template ||
        !isMessageTemplate(
          template,
        )
      ) {
        throw new Error(
          "Approved template not available.",
        )
      }

      const {
        data: config,
        error:
          configError,
      } =
        await admin
          .from(
            "whatsapp_config",
          )
          .select("*")
          .eq(
            "account_id",
            broadcast.account_id,
          )
          .maybeSingle()

      if (
        configError ||
        !config
      ) {
        throw new Error(
          "WhatsApp is not configured.",
        )
      }

      const {
        data: recipients,
        error:
          recipientError,
      } =
        await admin
          .from(
            "broadcast_recipients",
          )
          .select(
            "id,contact_id,status",
          )
          .eq(
            "broadcast_id",
            broadcast.id,
          )
          .eq(
            "status",
            "pending",
          )
          .limit(100)

      if (recipientError) {
        throw new Error(
          recipientError.message,
        )
      }

      const pending =
        recipients ?? []

      if (!pending.length) {
        await admin
          .from(
            "broadcasts",
          )
          .update({
            status:
              "sent",
          })
          .eq(
            "id",
            broadcast.id,
          )

        results.push({
          broadcast_id:
            broadcast.id,
          sent: 0,
          failed: 0,
          pending: 0,
        })

        continue
      }

      const contactIds =
        pending.map(
          (row) =>
            row.contact_id,
        )

      const {
        data: contacts,
        error:
          contactsError,
      } =
        await admin
          .from("contacts")
          .select(
            "id,user_id,account_id,phone,name,email,company",
          )
          .eq(
            "account_id",
            broadcast.account_id,
          )
          .in(
            "id",
            contactIds,
          )

      if (contactsError) {
        throw new Error(
          contactsError.message,
        )
      }

      const contactMap =
        new Map(
          (
            contacts ??
            []
          ).map(
            (contact) => [
              contact.id,
              contact,
            ],
          ),
        )

      const paramsMap =
        await resolveTemplateParams(
          broadcast.account_id,
          (contacts ??
            []) as any,
          broadcast.template_variables ??
            {},
        )

      const accessToken =
        decrypt(
          config.access_token,
        )

      let sent = 0
      let failed = 0
      let cancelled = false

      for (
        const recipient of
          pending
      ) {
        const {
          data: latest,
        } =
          await admin
            .from(
              "broadcasts",
            )
            .select(
              "status",
            )
            .eq(
              "id",
              broadcast.id,
            )
            .maybeSingle()

        if (
          latest?.status ===
          "cancelled"
        ) {
          cancelled = true
          break
        }

        const contact =
          contactMap.get(
            recipient.contact_id,
          )

        if (!contact) {
          failed++

          await admin
            .from(
              "broadcast_recipients",
            )
            .update({
              status:
                "failed",
              error_message:
                "Contact not found.",
            })
            .eq(
              "id",
              recipient.id,
            )

          continue
        }

        const phone =
          sanitizePhoneForMeta(
            contact.phone,
          )

        if (
          !isValidE164(
            phone,
          )
        ) {
          failed++

          await admin
            .from(
              "broadcast_recipients",
            )
            .update({
              status:
                "failed",
              error_message:
                "Invalid phone number format.",
            })
            .eq(
              "id",
              recipient.id,
            )

          continue
        }

        let messageId =
          ""

        const params =
          paramsMap.get(
            contact.id,
          ) ?? []

        for (
          const variant of
            phoneVariants(
              phone,
            )
        ) {
          try {
            const result =
              await sendTemplateMessage({
                phoneNumberId:
                  config.phone_number_id,
                accessToken,
                to: variant,
                template,
                templateName:
                  broadcast.template_name,
                language:
                  broadcast.template_language,
                params,
              })

            messageId =
              result.messageId

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

        if (!messageId) {
          failed++

          await admin
            .from(
              "broadcast_recipients",
            )
            .update({
              status:
                "failed",
              error_message:
                "WhatsApp template send failed.",
            })
            .eq(
              "id",
              recipient.id,
            )

          continue
        }

        sent++

        await admin
          .from(
            "broadcast_recipients",
          )
          .update({
            status:
              "sent",
            sent_at:
              new Date().toISOString(),
            whatsapp_message_id:
              messageId,
            error_message:
              null,
          })
          .eq(
            "id",
            recipient.id,
          )

        await sleep(100)
      }

      const {
        count: remaining,
      } =
        await admin
          .from(
            "broadcast_recipients",
          )
          .select(
            "id",
            {
              count:
                "exact",
              head: true,
            },
          )
          .eq(
            "broadcast_id",
            broadcast.id,
          )
          .eq(
            "status",
            "pending",
          )

      if (cancelled) {
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
            broadcast.id,
          )
          .eq(
            "status",
            "pending",
          )
      } else if (
        (remaining ?? 0) >
        0
      ) {
        await admin
          .from(
            "broadcasts",
          )
          .update({
            status:
              "scheduled",
          })
          .eq(
            "id",
            broadcast.id,
          )
      } else {
        await admin
          .from(
            "broadcasts",
          )
          .update({
            status:
              sent === 0 &&
              failed > 0
                ? "failed"
                : "sent",
          })
          .eq(
            "id",
            broadcast.id,
          )
      }

      results.push({
        broadcast_id:
          broadcast.id,
        sent,
        failed,
        pending:
          remaining ?? 0,
        cancelled,
      })
    } catch (error) {
      await admin
        .from(
          "broadcasts",
        )
        .update({
          status:
            "failed",
        })
        .eq(
          "id",
          broadcast.id,
        )

      results.push({
        broadcast_id:
          broadcast.id,
        error:
          error instanceof Error
            ? error.message
            : "Broadcast execution failed.",
      })
    }
  }

  return NextResponse.json({
    ok: true,
    processed:
      results.length,
    results,
  })
}
