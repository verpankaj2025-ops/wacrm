
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  appointmentDurationMs,
  canRebookAppointment,
} from "@/lib/appointments/rebooking";

async function requireAccount() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      status: 401,
      error: "Unauthorized",
    };
  }

  const {
    data: profile,
    error,
  } =
    await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .single();

  if (
    error ||
    !profile?.account_id
  ) {
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
  field: string,
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${field} is required.`,
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Invalid ${field}.`,
    );
  }

  return date.toISOString();
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const guard =
      await requireAccount();

    if (!guard.ok) {
      return NextResponse.json(
        {
          error:
            guard.error,
        },
        {
          status:
            guard.status,
        },
      );
    }

    const { id: sourceAppointmentId } =
      await context.params;

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
        {
          status: 400,
        },
      );
    }

    const admin =
      supabaseAdmin();

    const {
      data: source,
      error: sourceError,
    } =
      await admin
        .from("appointments")
        .select("*")
        .eq(
          "account_id",
          guard.accountId,
        )
        .eq(
          "id",
          sourceAppointmentId,
        )
        .maybeSingle();

    if (sourceError) {
      return NextResponse.json(
        {
          error:
            sourceError.message,
        },
        {
          status: 500,
        },
      );
    }

    if (!source) {
      return NextResponse.json(
        {
          error:
            "Original appointment not found.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      !canRebookAppointment(
        source.status,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Only completed or no-show appointments can be rebooked.",
        },
        {
          status: 400,
        },
      );
    }

    const startAt =
      parseDate(
        body.start_at,
        "start_at",
      );

    const durationMs =
      appointmentDurationMs(
        source.start_at,
        source.end_at,
      );

    const endAt =
      body.end_at
        ? parseDate(
            body.end_at,
            "end_at",
          )
        : new Date(
            new Date(
              startAt,
            ).getTime() +
              durationMs,
          ).toISOString();

    if (
      new Date(endAt).getTime() <=
      new Date(startAt).getTime()
    ) {
      return NextResponse.json(
        {
          error:
            "end_at must be after start_at.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      new Date(startAt).getTime() <
      Date.now()
    ) {
      return NextResponse.json(
        {
          error:
            "Rebooking time must be in the future.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      data: existingFuture,
      error:
        futureError,
    } =
      await admin
        .from("appointments")
        .select(
          "id,service_name,start_at,end_at,status",
        )
        .eq(
          "account_id",
          guard.accountId,
        )
        .eq(
          "contact_id",
          source.contact_id,
        )
        .in("status", [
          "scheduled",
          "confirmed",
        ])
        .gte(
          "start_at",
          new Date().toISOString(),
        )
        .order("start_at", {
          ascending: true,
        })
        .limit(1)
        .maybeSingle();

    if (futureError) {
      return NextResponse.json(
        {
          error:
            futureError.message,
        },
        {
          status: 500,
        },
      );
    }

    if (existingFuture) {
      return NextResponse.json(
        {
          error:
            "This contact already has a future appointment. Rebooking is not needed until that appointment is completed.",
          existing_appointment:
            existingFuture,
        },
        {
          status: 409,
        },
      );
    }

    const {
      data: conflicts,
      error: conflictError,
    } =
      await admin
        .from("appointments")
        .select(
          "id,contact_id,assigned_to,start_at,end_at,status",
        )
        .eq(
          "account_id",
          guard.accountId,
        )
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

    if (conflictError) {
      throw new Error(
        conflictError.message,
      );
    }

    const rows =
      conflicts ?? [];

    if (
      rows.some(
        (row) =>
          row.contact_id ===
          source.contact_id,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "This contact already has another appointment in the selected time range.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      source.assigned_to &&
      rows.some(
        (row) =>
          row.assigned_to ===
          source.assigned_to,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "The selected staff member already has another appointment in the selected time range.",
        },
        {
          status: 409,
        },
      );
    }

    const serviceName =
      typeof body.service_name ===
        "string" &&
      body.service_name.trim()
        ? body.service_name.trim()
        : source.service_name;

    const notes =
      typeof body.notes ===
        "string"
        ? body.notes.trim() ||
          null
        : source.notes;

    const {
      data: appointment,
      error: insertError,
    } =
      await admin
        .from("appointments")
        .insert({
          account_id:
            guard.accountId,
          contact_id:
            source.contact_id,
          conversation_id:
            source.conversation_id,
          assigned_to:
            source.assigned_to,
          service_name:
            serviceName,
          start_at:
            startAt,
          end_at:
            endAt,
          status:
            "scheduled",
          notes,
          source:
            "rebooking",
          created_by:
            guard.userId,
          rebooked_from_id:
            source.id,
        })
        .select("*")
        .single();

    if (insertError) {
      throw new Error(
        insertError.message,
      );
    }

    return NextResponse.json(
      {
        ok: true,
        appointment,
        rebooked_from:
          source.id,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to rebook appointment.",
      },
      {
        status: 400,
      },
    );
  }
}
