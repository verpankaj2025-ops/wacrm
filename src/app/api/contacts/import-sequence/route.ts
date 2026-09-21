import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  sanitizePhoneForMeta,
  isValidE164,
} from "@/lib/whatsapp/phone-utils";

type ImportRow = {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  sequence?: string;
  opt_in?: boolean;
};

function normaliseSequenceValue(
  value: unknown,
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function POST(
  request: Request,
) {
  try {
    const supabase =
      await createClient();

    const {
      data: { user },
    } =
      await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    const {
      data: profile,
    } =
      await supabase
        .from("profiles")
        .select(
          "account_id",
        )
        .eq(
          "user_id",
          user.id,
        )
        .single();

    const accountId =
      profile?.account_id;

    if (!accountId) {
      return NextResponse.json(
        {
          error:
            "Your profile is not linked to an account.",
        },
        {
          status: 403,
        },
      );
    }

    const body =
      await request
        .json()
        .catch(() => null);

    if (
      !body ||
      !Array.isArray(
        body.rows,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "rows[] is required",
        },
        {
          status: 400,
        },
      );
    }

    const rows =
      body.rows as ImportRow[];

    if (
      rows.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No rows to import.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      rows.length > 1000
    ) {
      return NextResponse.json(
        {
          error:
            "Maximum 1,000 rows per import.",
        },
        {
          status: 400,
        },
      );
    }

    const enroll =
      body.enroll_sequence ===
      true;

    const consentConfirmed =
      body.consent_confirmed ===
      true;

    if (
      enroll &&
      !consentConfirmed
    ) {
      return NextResponse.json(
        {
          error:
            "Confirm that the imported contacts have opted in to receive WhatsApp messages before starting a sequence.",
        },
        {
          status: 400,
        },
      );
    }

    const defaultSequence =
      String(
        body.default_sequence_id ??
          "",
      ).trim();

    const admin =
      supabaseAdmin();

    const {
      data: automations,
      error:
        automationError,
    } = await admin
      .from("automations")
      .select(
        "id, name, is_active, account_id, user_id",
      )
      .eq(
        "account_id",
        accountId,
      );

    if (
      automationError
    ) {
      return NextResponse.json(
        {
          error:
            automationError.message,
        },
        {
          status: 500,
        },
      );
    }

    const automationByKey =
      new Map<
        string,
        (typeof automations)[number]
      >();

    for (
      const automation of
        automations ?? []
    ) {
      automationByKey.set(
        automation.id
          .toLowerCase(),
        automation,
      );

      automationByKey.set(
        automation.name
          .trim()
          .toLowerCase(),
        automation,
      );
    }

    let imported = 0;
    let enrolled = 0;
    let skipped = 0;

    const errors: Array<{
      row: number;
      phone?: string;
      reason: string;
    }> = [];

    for (
      let index = 0;
      index < rows.length;
      index++
    ) {
      const row =
        rows[index];

      try {
        const rawPhone =
          String(
            row.phone ?? "",
          ).trim();

        if (!rawPhone) {
          throw new Error(
            "Phone is required.",
          );
        }

        const phone =
          sanitizePhoneForMeta(
            rawPhone,
          );

        if (
          !isValidE164(phone)
        ) {
          throw new Error(
            "Invalid phone number. Use E.164 format, e.g. +919876543210.",
          );
        }

        let automation:
          | (typeof automations)[number]
          | null =
          null;

        if (enroll) {
          const sequenceValue =
            normaliseSequenceValue(
              row.sequence,
            );

          const lookupKey =
            sequenceValue ||
            defaultSequence
              .toLowerCase();

          if (!lookupKey) {
            throw new Error(
              "No sequence selected for this lead.",
            );
          }

          automation =
            automationByKey.get(
              lookupKey,
            ) ?? null;

          if (!automation) {
            throw new Error(
              `Sequence "${row.sequence || defaultSequence}" not found.`,
            );
          }

          if (
            !automation.is_active
          ) {
            throw new Error(
              `Sequence "${automation.name}" is not active.`,
            );
          }

          if (
            row.opt_in ===
            false
          ) {
            throw new Error(
              "Lead is marked opt_in=false.",
            );
          }
        }

        // Find an existing contact within this account.
        const {
          data:
            existingContact,
        } =
          await admin
            .from("contacts")
            .select(
              "id",
            )
            .eq(
              "account_id",
              accountId,
            )
            .eq(
              "phone",
              phone,
            )
            .limit(1)
            .maybeSingle();

        let contactId =
          existingContact?.id ??
          null;

        if (
          contactId
        ) {
          const {
            error:
              updateError,
          } =
            await admin
              .from("contacts")
              .update({
                name:
                  row.name ||
                  undefined,
                email:
                  row.email ||
                  undefined,
                company:
                  row.company ||
                  undefined,
                updated_at:
                  new Date().toISOString(),
              })
              .eq(
                "id",
                contactId,
              )
              .eq(
                "account_id",
                accountId,
              );

          if (
            updateError
          ) {
            throw new Error(
              updateError.message,
            );
          }
        } else {
          const {
            data:
              created,
            error:
              createError,
          } =
            await admin
              .from("contacts")
              .insert({
                user_id:
                  user.id,
                account_id:
                  accountId,
                phone,
                name:
                  row.name ||
                  null,
                email:
                  row.email ||
                  null,
                company:
                  row.company ||
                  null,
                lead_source:
                  "manual",
                lead_status:
                  "new",
              })
              .select(
                "id",
              )
              .single();

          if (
            createError ||
            !created
          ) {
            throw new Error(
              createError?.message ??
                "Contact creation failed.",
            );
          }

          contactId =
            created.id;
        }

        imported++;

        if (
          !enroll ||
          !automation ||
          !contactId
        ) {
          continue;
        }

        // Reuse an existing conversation or create one so a scheduled
        // sequence always has a CRM conversation target.
        let conversationId:
          | string
          | null =
          null;

        const {
          data:
            existingConversation,
        } =
          await admin
            .from(
              "conversations",
            )
            .select(
              "id",
            )
            .eq(
              "account_id",
              accountId,
            )
            .eq(
              "contact_id",
              contactId,
            )
            .order(
              "created_at",
              {
                ascending:
                  false,
              },
            )
            .limit(1)
            .maybeSingle();

        conversationId =
          existingConversation?.id ??
          null;

        if (
          !conversationId
        ) {
          const {
            data:
              createdConversation,
            error:
              conversationError,
          } =
            await admin
              .from(
                "conversations",
              )
              .insert({
                user_id:
                  user.id,
                account_id:
                  accountId,
                contact_id:
                  contactId,
                status:
                  "open",
                last_message_text:
                  null,
                last_message_at:
                  null,
                unread_count:
                  0,
              })
              .select(
                "id",
              )
              .single();

          if (
            conversationError ||
            !createdConversation
          ) {
            throw new Error(
              conversationError?.message ??
                "Conversation creation failed.",
            );
          }

          conversationId =
            createdConversation.id;
        }

        // Prevent accidentally launching the same automation twice
        // for the same contact while one enrollment is active.
        const {
          data:
            existingEnrollment,
        } =
          await admin
            .from(
              "automation_enrollments",
            )
            .select(
              "id, status",
            )
            .eq(
              "account_id",
              accountId,
            )
            .eq(
              "automation_id",
              automation.id,
            )
            .eq(
              "contact_id",
              contactId,
            )
            .in(
              "status",
              [
                "pending",
                "running",
              ],
            )
            .limit(1)
            .maybeSingle();

        if (
          existingEnrollment
        ) {
          skipped++;
          continue;
        }

        const startedAt =
          new Date().toISOString();

        const {
          data:
            enrollment,
          error:
            enrollmentError,
        } =
          await admin
            .from(
              "automation_enrollments",
            )
            .insert({
              account_id:
                accountId,
              automation_id:
                automation.id,
              contact_id:
                contactId,
              status:
                "pending",
            })
            .select(
              "id",
            )
            .single();

        if (
          enrollmentError ||
          !enrollment
        ) {
          throw new Error(
            enrollmentError?.message ??
              "Failed to enroll lead.",
          );
        }

        // Put the sequence into the same reliable pending queue used
        // by automation waits. Cron will pick this up and execute the
        // sequence without making the HTTP import request wait for 1,000
        // individual automations.
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
                automation.user_id ??
                user.id,
              contact_id:
                contactId,
              log_id:
                null,
              parent_step_id:
                null,
              branch:
                null,
              next_step_position:
                0,
              context: {
                conversation_id:
                  conversationId,
                enrollment_id:
                  enrollment.id,
                automation_started_at:
                  startedAt,
              },
              run_at:
                startedAt,
              status:
                "pending",
              cancel_on_customer_reply:
                true,
            });

        if (
          pendingError
        ) {
          await admin
            .from(
              "automation_enrollments",
            )
            .update({
              status:
                "failed",
              error_message:
                pendingError.message,
              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              enrollment.id,
            );

          throw new Error(
            pendingError.message,
          );
        }

        await admin
          .from(
            "automation_enrollments",
          )
          .update({
            status:
              "running",
            started_at:
              startedAt,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            enrollment.id,
          );

        enrolled++;
      } catch (
        error
      ) {
        errors.push({
          row:
            index + 2,
          phone:
            row.phone,
          reason:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total:
        rows.length,
      imported,
      enrolled,
      skipped,
      failed:
        errors.length,
      errors:
        errors.slice(
          0,
          50,
        ),
    });
  } catch (
    error
  ) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Import failed",
      },
      {
        status: 500,
      },
    );
  }
}
