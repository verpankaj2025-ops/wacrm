import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";

const ALLOWED_STATUS = new Set([
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

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

  const { data: profile, error } =
    await supabase
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
    accountId:
      profile.account_id as string,
  };
}

function parseDate(
  value: unknown,
  fallback: string,
  field: string,
) {
  const raw =
    value === undefined ||
    value === null ||
    value === ""
      ? fallback
      : String(value);

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid ${field}.`,
    );
  }

  return date.toISOString();
}

async function validateReferences(
  accountId: string,
  contactId: string,
  assignedTo: string | null,
  conversationId: string | null,
) {
  const admin = supabaseAdmin();

  const { data: contact } =
    await admin
      .from("contacts")
      .select("id")
      .eq(
        "account_id",
        accountId,
      )
      .eq("id", contactId)
      .maybeSingle();

  if (!contact) {
    throw new Error(
      "Contact not found in this account.",
    );
  }

  if (assignedTo) {
    const { data: member } =
      await admin
        .from("profiles")
        .select("user_id")
        .eq(
          "account_id",
          accountId,
        )
        .eq(
          "user_id",
          assignedTo,
        )
        .maybeSingle();

    if (!member) {
      throw new Error(
        "Assigned team member is not part of this account.",
      );
    }
  }

  if (conversationId) {
    const {
      data: conversation,
    } = await admin
      .from("conversations")
      .select(
        "id,contact_id",
      )
      .eq(
        "account_id",
        accountId,
      )
      .eq(
        "id",
        conversationId,
      )
      .maybeSingle();

    if (!conversation) {
      throw new Error(
        "Conversation not found in this account.",
      );
    }

    if (
      conversation.contact_id !==
      contactId
    ) {
      throw new Error(
        "Conversation does not belong to the selected contact.",
      );
    }
  }
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
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

    const { id } =
      await context.params;

    const admin =
      supabaseAdmin();

    const {
      data: existing,
      error: existingError,
    } = await admin
      .from("appointments")
      .select("*")
      .eq("account_id", guard.accountId)
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error:
            existingError.message,
        },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Appointment not found.",
        },
        { status: 404 },
      );
    }

    const body =
      (await request
        .json()
        .catch(() => null)) as Record<
        string,
        unknown
      > | null;

    if (!body) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        { status: 400 },
      );
    }

    const contactId =
      typeof body.contact_id ===
      "string"
        ? body.contact_id
        : existing.contact_id;

    const assignedTo =
      body.assigned_to ===
        null ||
      body.assigned_to === ""
        ? null
        : typeof body.assigned_to ===
          "string"
          ? body.assigned_to
          : existing.assigned_to;

    const conversationId =
      body.conversation_id ===
        null ||
      body.conversation_id ===
        ""
        ? null
        : typeof body.conversation_id ===
          "string"
          ? body.conversation_id
          : existing.conversation_id;

    const startAt =
      parseDate(
        body.start_at,
        existing.start_at,
        "start_at",
      );

    const endAt =
      parseDate(
        body.end_at,
        existing.end_at,
        "end_at",
      );

    if (
      new Date(endAt).getTime() <=
      new Date(startAt).getTime()
    ) {
      return NextResponse.json(
        {
          error:
            "end_at must be after start_at.",
        },
        { status: 400 },
      );
    }

    const status =
      typeof body.status ===
        "string"
        ? body.status
        : existing.status;

    if (
      !ALLOWED_STATUS.has(
        status,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid appointment status.",
        },
        { status: 400 },
      );
    }

    const serviceName =
      typeof body.service_name ===
        "string"
        ? body.service_name.trim()
        : existing.service_name;

    if (!serviceName) {
      return NextResponse.json(
        {
          error:
            "service_name is required.",
        },
        { status: 400 },
      );
    }

    await validateReferences(
      guard.accountId,
      contactId,
      assignedTo,
      conversationId,
    );

    if (
      status === "scheduled" ||
      status === "confirmed"
    ) {
      let conflictQuery =
        admin
          .from("appointments")
          .select(
            "id,contact_id,assigned_to",
          )
          .eq(
            "account_id",
            guard.accountId,
          )
          .neq("id", id)
          .in("status", [
            "scheduled",
            "confirmed",
          ])
          .lt(
            "start_at",
            endAt,
          )
          .gt(
            "end_at",
            startAt,
          );

      const {
        data: conflicts,
        error: conflictError,
      } = await conflictQuery;

      if (conflictError) {
        throw new Error(
          conflictError.message,
        );
      }

      if (
        conflicts?.some(
          (row) =>
            row.contact_id ===
            contactId,
        )
      ) {
        throw new Error(
          "This contact already has another appointment in the selected time range.",
        );
      }

      if (
        assignedTo &&
        conflicts?.some(
          (row) =>
            row.assigned_to ===
            assignedTo,
        )
      ) {
        throw new Error(
          "The selected team member already has another appointment in the selected time range.",
        );
      }
    }

    const { data, error } =
      await admin
        .from("appointments")
        .update({
          contact_id:
            contactId,
          conversation_id:
            conversationId,
          assigned_to:
            assignedTo,
          service_name:
            serviceName,
          start_at:
            startAt,
          end_at:
            endAt,
          status,
          notes:
            typeof body.notes ===
            "string"
              ? body.notes.trim() ||
                null
              : existing.notes,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "account_id",
          guard.accountId,
        )
        .eq("id", id)
        .select("*")
        .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      appointment: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update appointment.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
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

    const { id } =
      await context.params;

    const { error } =
      await supabaseAdmin()
        .from("appointments")
        .delete()
        .eq(
          "account_id",
          guard.accountId,
        )
        .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete appointment.",
      },
      { status: 500 },
    );
  }
}
