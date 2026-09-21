import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  sendTemplateMessage,
  sendTextMessage,
} from "@/lib/whatsapp/meta-api";
import { decrypt } from "@/lib/whatsapp/encryption";
import { isMessageTemplate } from "@/lib/whatsapp/template-row-guard";
import {
  isRecipientNotAllowedError,
  isValidE164,
  phoneVariants,
  sanitizePhoneForMeta,
} from "@/lib/whatsapp/phone-utils";
import { isWithinCustomerServiceWindow } from "@/lib/automations/customer-window";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

type Action =
  | "start_sequence"
  | "freeform"
  | "template";

async function requireAccount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized",
    };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .single();

  if (error || !profile?.account_id) {
    return {
      ok: false as const,
      status: 403,
      error:
        error?.message ??
        "Your profile is not linked to an account.",
    };
  }

  return {
    ok: true as const,
    userId: user.id,
    accountId: profile.account_id as string,
  };
}

function parseDate(value: unknown) {
  const date = new Date(String(value ?? ""));

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid start time.");
  }

  return date.toISOString();
}

async function getLatestCustomerMessages(
  accountId: string,
  contactIds: string[],
) {
  const admin = supabaseAdmin();

  if (!contactIds.length) {
    return new Map<string, string | null>();
  }

  const { data: conversations, error } = await admin
    .from("conversations")
    .select("id,contact_id,created_at")
    .eq("account_id", accountId)
    .in("contact_id", contactIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const latestConversationByContact =
    new Map<string, string>();

  for (const conversation of conversations ?? []) {
    if (!latestConversationByContact.has(conversation.contact_id)) {
      latestConversationByContact.set(
        conversation.contact_id,
        conversation.id,
      );
    }
  }

  const conversationIds = [
    ...new Set(
      latestConversationByContact.values(),
    ),
  ];

  const { data: messages, error: messageError } =
    conversationIds.length
      ? await admin
          .from("messages")
          .select("conversation_id,created_at")
          .in("conversation_id", conversationIds)
          .eq("sender_type", "customer")
          .order("created_at", {
            ascending: false,
          })
      : { data: [], error: null };

  if (messageError) {
    throw new Error(messageError.message);
  }

  const latestByConversation =
    new Map<string, string>();

  for (const message of messages ?? []) {
    if (
      !latestByConversation.has(
        message.conversation_id,
      )
    ) {
      latestByConversation.set(
        message.conversation_id,
        message.created_at,
      );
    }
  }

  const result =
    new Map<string, string | null>();

  for (const contactId of contactIds) {
    const conversationId =
      latestConversationByContact.get(
        contactId,
      );

    result.set(
      contactId,
      conversationId
        ? latestByConversation.get(
            conversationId,
          ) ?? null
        : null,
    );
  }

  return result;
}

async function getOrCreateConversations(
  accountId: string,
  userId: string,
  contactIds: string[],
) {
  const admin = supabaseAdmin();
  const result = new Map<
    string,
    string
  >();

  if (!contactIds.length) {
    return result;
  }

  const { data: existing, error } = await admin
    .from("conversations")
    .select("id,contact_id,created_at")
    .eq("account_id", accountId)
    .in("contact_id", contactIds)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  for (const conversation of existing ?? []) {
    if (!result.has(conversation.contact_id)) {
      result.set(
        conversation.contact_id,
        conversation.id,
      );
    }
  }

  const missing = contactIds.filter(
    (contactId) =>
      !result.has(contactId),
  );

  for (const contactId of missing) {
    const { data: created, error: createError } =
      await admin
        .from("conversations")
        .insert({
          user_id: userId,
          account_id: accountId,
          contact_id: contactId,
          status: "open",
          last_message_text: null,
          last_message_at: null,
          unread_count: 0,
        })
        .select("id")
        .single();

    if (!createError && created) {
      result.set(
        contactId,
        created.id,
      );
    }
  }

  return result;
}

async function startSequence(
  accountId: string,
  userId: string,
  contactIds: string[],
  automationId: string,
  startAt: string,
  consentConfirmed: boolean,
) {
  if (!consentConfirmed) {
    throw new Error(
      "Confirm WhatsApp opt-in before starting the sequence.",
    );
  }

  const admin = supabaseAdmin();

  const { data: automation, error } =
    await admin
      .from("automations")
      .select(
        "id,name,is_active,user_id,account_id",
      )
      .eq("account_id", accountId)
      .eq("id", automationId)
      .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!automation) {
    throw new Error(
      "Follow-up sequence not found.",
    );
  }

  if (!automation.is_active) {
    throw new Error(
      "The selected follow-up sequence is not active.",
    );
  }

  const { data: firstStep, error: stepError } =
    await admin
      .from("automation_steps")
      .select(
        "id,position,step_type,step_config",
      )
      .eq(
        "automation_id",
        automation.id,
      )
      .is("parent_step_id", null)
      .order("position", {
        ascending: true,
      })
      .limit(1)
      .maybeSingle();

  if (stepError) {
    throw new Error(stepError.message);
  }

  if (!firstStep) {
    throw new Error(
      "The selected sequence has no steps.",
    );
  }

  const { data: contacts, error: contactError } =
    await admin
      .from("contacts")
      .select("id,name,phone")
      .eq("account_id", accountId)
      .in("id", contactIds);

  if (contactError) {
    throw new Error(contactError.message);
  }

  const rows = contacts ?? [];
  const latestMessages =
    await getLatestCustomerMessages(
      accountId,
      rows.map((row) => row.id),
    );

  const conversationMap =
    await getOrCreateConversations(
      accountId,
      userId,
      rows.map((row) => row.id),
    );

  let coldLeadTemplateValid = true;

  if (
    firstStep.step_type ===
    "send_template"
  ) {
    const config =
      (firstStep.step_config ??
        {}) as Record<
        string,
        unknown
      >;

    const templateName =
      typeof config.template_name ===
      "string"
        ? config.template_name.trim()
        : "";

    const templateLanguage =
      typeof config.language ===
        "string" &&
      config.language.trim()
        ? config.language.trim()
        : "en_US";

    if (!templateName) {
      coldLeadTemplateValid = false;
    } else {
      const { data: approvedTemplate } =
        await admin
          .from("message_templates")
          .select("id")
          .eq(
            "account_id",
            accountId,
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
          .limit(1)
          .maybeSingle();

      coldLeadTemplateValid =
        Boolean(approvedTemplate);
    }
  }

  const results: Array<{
    contact_id: string;
    status:
      | "started"
      | "skipped"
      | "failed";
    reason?: string;
  }> = [];

  for (const contact of rows) {
    try {
      const insideWindow =
        isWithinCustomerServiceWindow(
          latestMessages.get(
            contact.id,
          ),
        );

      if (
        !insideWindow &&
        firstStep.step_type !==
          "send_template"
      ) {
        results.push({
          contact_id: contact.id,
          status: "skipped",
          reason:
            "24h window closed. Cold leads require an approved template as the first step.",
        });
        continue;
      }

      if (
        !insideWindow &&
        !coldLeadTemplateValid
      ) {
        results.push({
          contact_id: contact.id,
          status: "skipped",
          reason:
            "Approved WhatsApp template required for this cold lead.",
        });
        continue;
      }

      const { data: existing } =
        await admin
          .from("automation_enrollments")
          .select("id,status")
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
            contact.id,
          )
          .in("status", [
            "pending",
            "running",
            "paused",
          ])
          .limit(1)
          .maybeSingle();

      if (existing) {
        results.push({
          contact_id: contact.id,
          status: "skipped",
          reason:
            "Already enrolled in this sequence.",
        });
        continue;
      }

      const conversationId =
        conversationMap.get(
          contact.id,
        );

      if (!conversationId) {
        results.push({
          contact_id: contact.id,
          status: "failed",
          reason:
            "Conversation could not be created.",
        });
        continue;
      }

      const {
        data: enrollment,
        error: enrollmentError,
      } = await admin
        .from(
          "automation_enrollments",
        )
        .insert({
          account_id: accountId,
          automation_id:
            automation.id,
          contact_id: contact.id,
          status: "pending",
          next_run_at: startAt,
          current_step_position: 0,
        })
        .select("id")
        .single();

      if (
        enrollmentError ||
        !enrollment
      ) {
        results.push({
          contact_id: contact.id,
          status: "failed",
          reason:
            enrollmentError?.message ??
            "Failed to create enrollment.",
        });
        continue;
      }

      const { error: pendingError } =
        await admin
          .from(
            "automation_pending_executions",
          )
          .insert({
            automation_id:
              automation.id,
            account_id: accountId,
            user_id:
              automation.user_id ??
              userId,
            contact_id: contact.id,
            log_id: null,
            parent_step_id: null,
            branch: null,
            next_step_position: 0,
            context: {
              conversation_id:
                conversationId,
              enrollment_id:
                enrollment.id,
              automation_started_at:
                startAt,
            },
            run_at: startAt,
            status: "pending",
            cancel_on_customer_reply: true,
          });

      if (pendingError) {
        await admin
          .from(
            "automation_enrollments",
          )
          .update({
            status: "failed",
            error_message:
              pendingError.message,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            enrollment.id,
          );

        results.push({
          contact_id: contact.id,
          status: "failed",
          reason:
            pendingError.message,
        });
        continue;
      }

      await admin
        .from(
          "automation_enrollments",
        )
        .update({
          status: "running",
          started_at: startAt,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          enrollment.id,
        );

      results.push({
        contact_id: contact.id,
        status: "started",
      });
    } catch (error) {
      results.push({
        contact_id: contact.id,
        status: "failed",
        reason:
          error instanceof Error
            ? error.message
            : "Failed to start follow-up.",
      });
    }
  }

  return {
    total: results.length,
    started: results.filter(
      (row) => row.status === "started",
    ).length,
    skipped: results.filter(
      (row) => row.status === "skipped",
    ).length,
    failed: results.filter(
      (row) => row.status === "failed",
    ).length,
    results,
  };
}

async function sendFreeform(
  accountId: string,
  userId: string,
  contactIds: string[],
  text: string,
) {
  const admin = supabaseAdmin();

  const { data: config, error } =
    await admin
      .from("whatsapp_config")
      .select("*")
      .eq("account_id", accountId)
      .single();

  if (error || !config) {
    throw new Error(
      "WhatsApp is not configured.",
    );
  }

  const accessToken =
    decrypt(config.access_token);

  const { data: contacts, error: contactError } =
    await admin
      .from("contacts")
      .select("id,name,phone")
      .eq("account_id", accountId)
      .in("id", contactIds);

  if (contactError) {
    throw new Error(contactError.message);
  }

  const rows = contacts ?? [];

  const latestMessages =
    await getLatestCustomerMessages(
      accountId,
      rows.map((row) => row.id),
    );

  const conversationMap =
    await getOrCreateConversations(
      accountId,
      userId,
      rows.map((row) => row.id),
    );

  const results: Array<{
    contact_id: string;
    status:
      | "sent"
      | "blocked"
      | "failed";
    reason?: string;
  }> = [];

  for (const contact of rows) {
    const latestCustomerMessage =
      latestMessages.get(
        contact.id,
      );

    if (
      !isWithinCustomerServiceWindow(
        latestCustomerMessage,
      )
    ) {
      results.push({
        contact_id: contact.id,
        status: "blocked",
        reason:
          "24h WhatsApp window is closed. Use an approved template.",
      });
      continue;
    }

    const conversationId =
      conversationMap.get(
        contact.id,
      );

    if (!conversationId) {
      results.push({
        contact_id: contact.id,
        status: "failed",
        reason:
          "Conversation not available.",
      });
      continue;
    }

    const phone =
      sanitizePhoneForMeta(
        contact.phone,
      );

    if (!isValidE164(phone)) {
      results.push({
        contact_id: contact.id,
        status: "failed",
        reason:
          "Invalid phone number format.",
      });
      continue;
    }

    const finalText =
      text.replaceAll(
        "{{name}}",
        contact.name?.trim() ||
          "there",
      );

    let messageId = "";

    for (const variant of phoneVariants(
      phone,
    )) {
      try {
        const sent =
          await sendTextMessage({
            phoneNumberId:
              config.phone_number_id,
            accessToken,
            to: variant,
            text: finalText,
          });

        messageId =
          sent.messageId;

        break;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        if (
          !isRecipientNotAllowedError(
            message,
          )
        ) {
          break;
        }
      }
    }

    if (!messageId) {
      results.push({
        contact_id: contact.id,
        status: "failed",
        reason:
          "WhatsApp send failed.",
      });
      continue;
    }

    const { error: insertError } =
      await admin
        .from("messages")
        .insert({
          conversation_id:
            conversationId,
          sender_type: "agent",
          content_type: "text",
          content_text:
            finalText,
          media_url: null,
          template_name: null,
          message_id: messageId,
          status: "sent",
        });

    if (insertError) {
      results.push({
        contact_id: contact.id,
        status: "failed",
        reason:
          insertError.message,
      });
      continue;
    }

    await admin
      .from("conversations")
      .update({
        last_message_text:
          finalText,
        last_message_at:
          new Date().toISOString(),
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        conversationId,
      );

    results.push({
      contact_id: contact.id,
      status: "sent",
    });
  }

  return {
    total: results.length,
    sent: results.filter(
      (row) => row.status === "sent",
    ).length,
    blocked: results.filter(
      (row) => row.status === "blocked",
    ).length,
    failed: results.filter(
      (row) => row.status === "failed",
    ).length,
    results,
  };
}

async function sendTemplate(
  accountId: string,
  userId: string,
  contactIds: string[],
  templateName: string,
  language: string,
) {
  const admin = supabaseAdmin();

  const { data: config, error } =
    await admin
      .from("whatsapp_config")
      .select("*")
      .eq("account_id", accountId)
      .single();

  if (error || !config) {
    throw new Error(
      "WhatsApp is not configured.",
    );
  }

  const accessToken =
    decrypt(config.access_token);

  const {
    data: rawTemplate,
    error: templateError,
  } = await admin
    .from("message_templates")
    .select("*")
    .eq("account_id", accountId)
    .eq("name", templateName)
    .eq("language", language)
    .eq("status", "APPROVED")
    .maybeSingle();

  if (templateError) {
    throw new Error(
      templateError.message,
    );
  }

  if (
    !rawTemplate ||
    !isMessageTemplate(rawTemplate)
  ) {
    throw new Error(
      `Approved template "${templateName}" (${language}) was not found.`,
    );
  }

  const { data: contacts, error: contactError } =
    await admin
      .from("contacts")
      .select("id,name,phone")
      .eq("account_id", accountId)
      .in("id", contactIds);

  if (contactError) {
    throw new Error(contactError.message);
  }

  const rows = contacts ?? [];

  const conversationMap =
    await getOrCreateConversations(
      accountId,
      userId,
      rows.map((row) => row.id),
    );

  const results: Array<{
    contact_id: string;
    status: "sent" | "failed";
    reason?: string;
  }> = [];

  for (const contact of rows) {
    const conversationId =
      conversationMap.get(
        contact.id,
      );

    if (!conversationId) {
      results.push({
        contact_id: contact.id,
        status: "failed",
        reason:
          "Conversation could not be created.",
      });
      continue;
    }

    const phone =
      sanitizePhoneForMeta(
        contact.phone,
      );

    if (!isValidE164(phone)) {
      results.push({
        contact_id: contact.id,
        status: "failed",
        reason:
          "Invalid phone number format.",
      });
      continue;
    }

    let messageId = "";

    for (const variant of phoneVariants(
      phone,
    )) {
      try {
        const sent =
          await sendTemplateMessage({
            phoneNumberId:
              config.phone_number_id,
            accessToken,
            to: variant,
            templateName,
            language,
            template:
              rawTemplate,
            params: [],
          });

        messageId =
          sent.messageId;

        break;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        if (
          !isRecipientNotAllowedError(
            message,
          )
        ) {
          break;
        }
      }
    }

    if (!messageId) {
      results.push({
        contact_id: contact.id,
        status: "failed",
        reason:
          "WhatsApp template send failed.",
      });
      continue;
    }

    await admin
      .from("messages")
      .insert({
        conversation_id:
          conversationId,
        sender_type: "agent",
        content_type:
          "template",
        content_text: null,
        media_url: null,
        template_name:
          templateName,
        message_id: messageId,
        status: "sent",
      });

    await admin
      .from("conversations")
      .update({
        last_message_text:
          `[${templateName}]`,
        last_message_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        conversationId,
      );

    results.push({
      contact_id: contact.id,
      status: "sent",
    });
  }

  return {
    total: results.length,
    sent: results.filter(
      (row) => row.status === "sent",
    ).length,
    failed: results.filter(
      (row) => row.status === "failed",
    ).length,
    results,
  };
}

export async function POST(
  request: Request,
) {
  try {
    const account =
      await requireAccount();

    if (!account.ok) {
      return NextResponse.json(
        { error: account.error },
        { status: account.status },
      );
    }

    const limit =
      checkRateLimit(
        `contact-bulk-action:${account.userId}`,
        RATE_LIMITS.broadcast,
      );

    if (!limit.success) {
      return rateLimitResponse(
        limit,
      );
    }

    const body =
      await request.json();

    const contactIds: string[] = [
      ...new Set<string>(
        Array.isArray(
          body?.contact_ids,
        )
          ? body.contact_ids
              .map((id: unknown) =>
                String(id),
              )
              .filter(Boolean)
          : [],
      ),
    ];

    if (
      contactIds.length === 0 ||
      contactIds.length > 2000
    ) {
      return NextResponse.json(
        {
          error:
            "Select between 1 and 2000 contacts.",
        },
        { status: 400 },
      );
    }

    const action =
      body?.action as Action;

    if (
      action === "start_sequence"
    ) {
      const automationId =
        typeof body?.automation_id ===
        "string"
          ? body.automation_id.trim()
          : "";

      if (!automationId) {
        return NextResponse.json(
          {
            error:
              "Follow-up sequence is required.",
          },
          { status: 400 },
        );
      }

      const startAt =
        body?.start_at
          ? parseDate(body.start_at)
          : new Date().toISOString();

      const result =
        await startSequence(
          account.accountId,
          account.userId,
          contactIds,
          automationId,
          startAt,
          body?.consent_confirmed ===
            true,
        );

      return NextResponse.json({
        ok: true,
        action,
        ...result,
      });
    }

    if (
      action === "freeform"
    ) {
      const text =
        typeof body?.text ===
        "string"
          ? body.text.trim()
          : "";

      if (!text) {
        return NextResponse.json(
          {
            error:
              "Free-form message is required.",
          },
          { status: 400 },
        );
      }

      const result =
        await sendFreeform(
          account.accountId,
          account.userId,
          contactIds,
          text,
        );

      return NextResponse.json({
        ok: true,
        action,
        ...result,
      });
    }

    if (
      action === "template"
    ) {
      const templateName =
        typeof body?.template_name ===
        "string"
          ? body.template_name.trim()
          : "";

      const language =
        typeof body?.template_language ===
          "string" &&
        body.template_language.trim()
          ? body.template_language.trim()
          : "en_US";

      if (!templateName) {
        return NextResponse.json(
          {
            error:
              "Approved WhatsApp template is required.",
          },
          { status: 400 },
        );
      }

      const result =
        await sendTemplate(
          account.accountId,
          account.userId,
          contactIds,
          templateName,
          language,
        );

      return NextResponse.json({
        ok: true,
        action,
        ...result,
      });
    }

    return NextResponse.json(
      {
        error:
          "Unsupported bulk contact action.",
      },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Bulk contact action failed.";

    return NextResponse.json(
      { error: message },
      {
        status:
          message === "Unauthorized"
            ? 401
            : 500,
      },
    );
  }
}
