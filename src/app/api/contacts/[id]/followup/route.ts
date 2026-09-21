import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { isWithinCustomerServiceWindow } from "@/lib/automations/customer-window";

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

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const guard = await requireAccount();

    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.status },
      );
    }

    const { id: contactId } =
      await context.params;

    const body =
      (await request
        .json()
        .catch(() => null)) as Record<string, unknown> | null;

    if (!body) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 },
      );
    }

    const automationId =
      typeof body.automation_id === "string"
        ? body.automation_id.trim()
        : "";

    if (!automationId) {
      return NextResponse.json(
        { error: "automation_id is required." },
        { status: 400 },
      );
    }

    if (body.consent_confirmed !== true) {
      return NextResponse.json(
        {
          error:
            "Confirm WhatsApp opt-in before starting an automated sequence.",
        },
        { status: 400 },
      );
    }

    const rawStartAt =
      typeof body.start_at === "string" &&
      body.start_at.trim()
        ? body.start_at.trim()
        : new Date().toISOString();

    const startAt = new Date(rawStartAt);

    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json(
        { error: "Invalid start time." },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    const { data: contact, error: contactError } =
      await admin
        .from("contacts")
        .select("id,name,phone")
        .eq("account_id", guard.accountId)
        .eq("id", contactId)
        .maybeSingle();

    if (contactError) {
      return NextResponse.json(
        { error: contactError.message },
        { status: 500 },
      );
    }

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found in this account." },
        { status: 404 },
      );
    }

    const { data: automation, error: automationError } =
      await admin
        .from("automations")
        .select("id,name,is_active,user_id,account_id")
        .eq("account_id", guard.accountId)
        .eq("id", automationId)
        .maybeSingle();

    if (automationError) {
      return NextResponse.json(
        { error: automationError.message },
        { status: 500 },
      );
    }

    if (!automation) {
      return NextResponse.json(
        { error: "Follow-up sequence not found." },
        { status: 404 },
      );
    }

    if (!automation.is_active) {
      return NextResponse.json(
        {
          error:
            "The selected follow-up sequence is not active.",
        },
        { status: 400 },
      );
    }

    const { data: firstStep, error: firstStepError } =
      await admin
        .from("automation_steps")
        .select("id,position,step_type,step_config")
        .eq("automation_id", automation.id)
        .is("parent_step_id", null)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (firstStepError) {
      return NextResponse.json(
        { error: firstStepError.message },
        { status: 500 },
      );
    }

    if (!firstStep) {
      return NextResponse.json(
        {
          error:
            "This sequence has no steps. Add at least one step in the Automation Builder.",
        },
        { status: 400 },
      );
    }

    const { data: latestCustomerMessage } =
      await admin
        .from("messages")
        .select("created_at")
        .eq(
          "conversation_id",
          (
            await admin
              .from("conversations")
              .select("id")
              .eq("account_id", guard.accountId)
              .eq("contact_id", contactId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          ).data?.id ?? "",
        )
        .eq("sender_type", "customer")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    const insideWindow =
      isWithinCustomerServiceWindow(
        latestCustomerMessage?.created_at,
      );

    if (!insideWindow) {
      if (firstStep.step_type !== "send_template") {
        return NextResponse.json(
          {
            error:
              "This is a cold lead outside the 24-hour WhatsApp window. The first step must be Send Template. After the customer replies, later Send Message steps can use free-form text during the 24-hour window.",
            code: "COLD_LEAD_TEMPLATE_REQUIRED",
          },
          { status: 400 },
        );
      }

      const config =
        (firstStep.step_config ?? {}) as Record<
          string,
          unknown
        >;

      const templateName =
        typeof config.template_name === "string"
          ? config.template_name.trim()
          : "";

      const templateLanguage =
        typeof config.language === "string" &&
        config.language.trim()
          ? config.language.trim()
          : "en_US";

      if (!templateName) {
        return NextResponse.json(
          {
            error:
              "The first Send Template step has no template name.",
          },
          { status: 400 },
        );
      }

      const { data: approvedTemplate } =
        await admin
          .from("message_templates")
          .select("id,name,language,status")
          .eq("account_id", guard.accountId)
          .ilike("name", templateName)
          .eq("language", templateLanguage)
          .eq("status", "APPROVED")
          .limit(1)
          .maybeSingle();

      if (!approvedTemplate) {
        return NextResponse.json(
          {
            error:
              `Template "${templateName}" (${templateLanguage}) is not an APPROVED WhatsApp template in this account. Open the sequence in Automations and select/use an approved Meta template first.`,
            code: "APPROVED_TEMPLATE_REQUIRED",
          },
          { status: 400 },
        );
      }
    }

    let conversationId: string | null = null;

    const { data: existingConversation } =
      await admin
        .from("conversations")
        .select("id")
        .eq("account_id", guard.accountId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    conversationId =
      existingConversation?.id ?? null;

    if (!conversationId) {
      const { data: createdConversation, error } =
        await admin
          .from("conversations")
          .insert({
            user_id: guard.userId,
            account_id: guard.accountId,
            contact_id: contactId,
            status: "open",
            last_message_text: null,
            last_message_at: null,
            unread_count: 0,
          })
          .select("id")
          .single();

      if (error || !createdConversation) {
        return NextResponse.json(
          {
            error:
              error?.message ??
              "Could not create conversation.",
          },
          { status: 500 },
        );
      }

      conversationId =
        createdConversation.id;
    }

    const { data: existingEnrollment } =
      await admin
        .from("automation_enrollments")
        .select("id,status")
        .eq("account_id", guard.accountId)
        .eq("automation_id", automation.id)
        .eq("contact_id", contactId)
        .in("status", [
          "pending",
          "running",
          "paused",
        ])
        .limit(1)
        .maybeSingle();

    if (existingEnrollment) {
      return NextResponse.json(
        {
          error:
            "This contact already has an active enrollment for this sequence.",
          enrollment_id:
            existingEnrollment.id,
          status:
            existingEnrollment.status,
        },
        { status: 409 },
      );
    }

    const startedAt =
      startAt.toISOString();

    const { data: enrollment, error: enrollmentError } =
      await admin
        .from("automation_enrollments")
        .insert({
          account_id:
            guard.accountId,
          automation_id:
            automation.id,
          contact_id:
            contactId,
          status:
            "pending",
          next_run_at:
            startedAt,
          current_step_position:
            0,
        })
        .select("id")
        .single();

    if (enrollmentError || !enrollment) {
      return NextResponse.json(
        {
          error:
            enrollmentError?.message ??
            "Failed to create follow-up enrollment.",
        },
        { status: 500 },
      );
    }

    const { error: pendingError } =
      await admin
        .from(
          "automation_pending_executions",
        )
        .insert({
          automation_id:
            automation.id,
          account_id:
            guard.accountId,
          user_id:
            automation.user_id ??
            guard.userId,
          contact_id:
            contactId,
          log_id: null,
          parent_step_id:
            null,
          branch: null,
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

    if (pendingError) {
      await admin
        .from("automation_enrollments")
        .update({
          status:
            "failed",
          error_message:
            pendingError.message,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", enrollment.id);

      return NextResponse.json(
        { error: pendingError.message },
        { status: 500 },
      );
    }

    await admin
      .from("automation_enrollments")
      .update({
        status:
          "running",
        started_at:
          startedAt,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", enrollment.id);

    return NextResponse.json(
      {
        ok: true,
        enrollment_id:
          enrollment.id,
        sequence:
          automation.name,
        start_at:
          startedAt,
        cold_lead:
          !insideWindow,
        first_step:
          firstStep.step_type,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start follow-up.",
      },
      { status: 500 },
    );
  }
}
