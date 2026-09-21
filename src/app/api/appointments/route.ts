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

type Body = Record<string, unknown>;

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

function parseDate(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${field}.`);
  }

  return date.toISOString();
}

async function validateReferences(
  accountId: string,
  body: Body,
) {
  const admin = supabaseAdmin();

  const contactId =
    typeof body.contact_id === "string"
      ? body.contact_id
      : "";

  if (!contactId) {
    throw new Error("contact_id is required.");
  }

  const { data: contact } = await admin
    .from("contacts")
    .select("id")
    .eq("account_id", accountId)
    .eq("id", contactId)
    .maybeSingle();

  if (!contact) {
    throw new Error("Contact not found in this account.");
  }

  const assignedTo =
    typeof body.assigned_to === "string" &&
    body.assigned_to.trim()
      ? body.assigned_to.trim()
      : null;

  if (assignedTo) {
    const { data: member } = await admin
      .from("profiles")
      .select("user_id")
      .eq("account_id", accountId)
      .eq("user_id", assignedTo)
      .maybeSingle();

    if (!member) {
      throw new Error(
        "Assigned team member is not part of this account.",
      );
    }
  }

  const conversationId =
    typeof body.conversation_id === "string" &&
    body.conversation_id.trim()
      ? body.conversation_id.trim()
      : null;

  if (conversationId) {
    const { data: conversation } = await admin
      .from("conversations")
      .select("id,contact_id")
      .eq("account_id", accountId)
      .eq("id", conversationId)
      .maybeSingle();

    if (!conversation) {
      throw new Error(
        "Conversation not found in this account.",
      );
    }

    if (conversation.contact_id !== contactId) {
      throw new Error(
        "Conversation does not belong to the selected contact.",
      );
    }
  }

  return {
    contactId,
    assignedTo,
    conversationId,
  };
}

async function assertNoConflict(args: {
  accountId: string;
  contactId: string;
  assignedTo: string | null;
  startAt: string;
  endAt: string;
  excludeId?: string;
}) {
  const admin = supabaseAdmin();

  let query = admin
    .from("appointments")
    .select(
      "id,contact_id,assigned_to,start_at,end_at,status",
    )
    .eq("account_id", args.accountId)
    .in("status", [
      "scheduled",
      "confirmed",
    ])
    .lt("start_at", args.endAt)
    .gt("end_at", args.startAt);

  if (args.excludeId) {
    query = query.neq("id", args.excludeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];

  const contactConflict = rows.some(
    (row) =>
      row.contact_id === args.contactId,
  );

  if (contactConflict) {
    throw new Error(
      "This contact already has another appointment in the selected time range.",
    );
  }

  if (
    args.assignedTo &&
    rows.some(
      (row) =>
        row.assigned_to ===
        args.assignedTo,
    )
  ) {
    throw new Error(
      "The selected team member already has another appointment in the selected time range.",
    );
  }
}

export async function GET(
  request: Request,
) {
  try {
    const guard = await requireAccount();

    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.status },
      );
    }

    const admin = supabaseAdmin();
    const url = new URL(request.url);

    const status = url.searchParams.get("status");
    const contactId =
      url.searchParams.get("contact_id");
    const includeContacts =
      url.searchParams.get("include_contacts") ===
      "true";

    let query = admin
      .from("appointments")
      .select("*")
      .eq("account_id", guard.accountId)
      .order("start_at", {
        ascending: true,
      })
      .limit(500);

    if (
      status &&
      ALLOWED_STATUS.has(status)
    ) {
      query = query.eq("status", status);
    }

    if (contactId) {
      query = query.eq(
        "contact_id",
        contactId,
      );
    }

    const {
      data: appointments,
      error,
    } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    let contacts: unknown[] = [];

    if (includeContacts) {
      const {
        data,
        error: contactsError,
      } = await admin
        .from("contacts")
        .select("id,name,phone,email")
        .eq("account_id", guard.accountId)
        .order("name", {
          ascending: true,
          nullsFirst: false,
        })
        .limit(1000);

      if (contactsError) {
        return NextResponse.json(
          { error: contactsError.message },
          { status: 500 },
        );
      }

      contacts = data ?? [];
    }

    const contactIds = [
      ...new Set(
        (appointments ?? []).map(
          (appointment) =>
            appointment.contact_id,
        ),
      ),
    ];

    const assigneeIds = [
      ...new Set(
        (appointments ?? [])
          .map(
            (appointment) =>
              appointment.assigned_to,
          )
          .filter(Boolean),
      ),
    ];

    const [
      contactsResult,
      profilesResult,
    ] = await Promise.all([
      contactIds.length
        ? admin
            .from("contacts")
            .select("id,name,phone")
            .eq("account_id", guard.accountId)
            .in("id", contactIds)
        : Promise.resolve({
            data: [],
            error: null,
          }),
      assigneeIds.length
        ? admin
            .from("profiles")
            .select(
              "user_id,full_name,email,avatar_url",
            )
            .eq(
              "account_id",
              guard.accountId,
            )
            .in(
              "user_id",
              assigneeIds,
            )
        : Promise.resolve({
            data: [],
            error: null,
          }),
    ]);

    if (contactsResult.error) {
      return NextResponse.json(
        { error: contactsResult.error.message },
        { status: 500 },
      );
    }

    if (profilesResult.error) {
      return NextResponse.json(
        { error: profilesResult.error.message },
        { status: 500 },
      );
    }

    const contactMap = new Map(
      (contactsResult.data ?? []).map(
        (contact) => [contact.id, contact],
      ),
    );

    const profileMap = new Map(
      (profilesResult.data ?? []).map(
        (profile) => [
          profile.user_id,
          profile,
        ],
      ),
    );

    return NextResponse.json({
      appointments:
        (appointments ?? []).map(
          (appointment) => ({
            ...appointment,
            contact:
              contactMap.get(
                appointment.contact_id,
              ) ?? null,
            assignee:
              appointment.assigned_to
                ? profileMap.get(
                    appointment.assigned_to,
                  ) ?? null
                : null,
          }),
        ),
      contacts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load appointments.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    const guard = await requireAccount();

    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.status },
      );
    }

    const body =
      (await request
        .json()
        .catch(() => null)) as Body | null;

    if (!body) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        { status: 400 },
      );
    }

    const serviceName =
      typeof body.service_name ===
        "string"
        ? body.service_name.trim()
        : "";

    if (!serviceName) {
      return NextResponse.json(
        {
          error:
            "service_name is required.",
        },
        { status: 400 },
      );
    }

    const startAt = parseDate(
      body.start_at,
      "start_at",
    );

    const endAt = parseDate(
      body.end_at,
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
      typeof body.status === "string" &&
      ALLOWED_STATUS.has(body.status)
        ? body.status
        : "scheduled";

    const refs =
      await validateReferences(
        guard.accountId,
        body,
      );

    await assertNoConflict({
      accountId:
        guard.accountId,
      contactId:
        refs.contactId,
      assignedTo:
        refs.assignedTo,
      startAt,
      endAt,
    });

    const { data, error } =
      await supabaseAdmin()
        .from("appointments")
        .insert({
          account_id:
            guard.accountId,
          contact_id:
            refs.contactId,
          conversation_id:
            refs.conversationId,
          assigned_to:
            refs.assignedTo,
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
              : null,
          source:
            typeof body.source ===
            "string"
              ? body.source.trim() ||
                "manual"
              : "manual",
          created_by:
            guard.userId,
        })
        .select("*")
        .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { appointment: data },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create appointment.",
      },
      { status: 400 },
    );
  }
}
