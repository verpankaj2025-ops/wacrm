import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/automations/admin-client";

async function requireUser() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      status: 401,
      body: {
        error: "Unauthorized",
      },
    };
  }

  return {
    ok: true as const,
    userId: user.id,
    supabase,
  };
}

async function getAccountId(
  userId: string,
  supabase: Awaited<
    ReturnType<typeof createClient>
  >,
) {
  const { data } =
    await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", userId)
      .single();

  return data?.account_id ?? null;
}

function normalizeDueAt(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  return date.toISOString();
}

const ALLOWED_PRIORITIES = new Set([
  "low",
  "medium",
  "high",
]);

async function validateReferences(
  accountId: string,
  body: Record<string, unknown>,
) {
  const admin =
    supabaseAdmin();

  const assignedTo =
    body.assigned_to;

  if (
    assignedTo !== null &&
    assignedTo !== undefined &&
    assignedTo !== ""
  ) {
    const {
      data: profile,
    } = await admin
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

    if (!profile) {
      return "Assigned team member is not part of this account.";
    }
  }

  const contactId =
    body.contact_id;

  if (contactId) {
    const {
      data: contact,
    } = await admin
      .from("contacts")
      .select("id")
      .eq(
        "account_id",
        accountId,
      )
      .eq(
        "id",
        contactId,
      )
      .maybeSingle();

    if (!contact) {
      return "Contact not found in this account.";
    }
  }

  const conversationId =
    body.conversation_id;

  if (conversationId) {
    const {
      data: conversation,
    } = await admin
      .from("conversations")
      .select(
        "id, contact_id",
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
      return "Conversation not found in this account.";
    }

    if (
      contactId &&
      conversation.contact_id !==
        contactId
    ) {
      return "Conversation does not belong to the selected contact.";
    }
  }

  return null;
}

export async function GET() {
  const guard =
    await requireUser();

  if (!guard.ok) {
    return NextResponse.json(
      guard.body,
      {
        status:
          guard.status,
      },
    );
  }

  const accountId =
    await getAccountId(
      guard.userId,
      guard.supabase,
    );

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

  const {
    data,
    error,
  } = await supabaseAdmin()
    .from("tasks")
    .select("*")
    .eq(
      "account_id",
      accountId,
    )
    .order(
      "created_at",
      {
        ascending: false,
      },
    );

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    tasks: data ?? [],
  });
}

export async function POST(
  request: Request,
) {
  const guard =
    await requireUser();

  if (!guard.ok) {
    return NextResponse.json(
      guard.body,
      {
        status:
          guard.status,
      },
    );
  }

  const accountId =
    await getAccountId(
      guard.userId,
      guard.supabase,
    );

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
    typeof body !== "object"
  ) {
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

  const payload =
    body as Record<
      string,
      unknown
    >;

  const title =
    typeof payload.title ===
    "string"
      ? payload.title.trim()
      : "";

  if (!title) {
    return NextResponse.json(
      {
        error:
          "title is required",
      },
      {
        status: 400,
      },
    );
  }

  const priority =
    typeof payload.priority ===
    "string"
      ? payload.priority
      : "medium";

  if (
    !ALLOWED_PRIORITIES.has(
      priority,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid priority.",
      },
      {
        status: 400,
      },
    );
  }

  const dueAt =
    normalizeDueAt(
      payload.due_at,
    );

  if (
    payload.due_at &&
    !dueAt
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid due date/time.",
      },
      {
        status: 400,
      },
    );
  }

  const referenceError =
    await validateReferences(
      accountId,
      payload,
    );

  if (referenceError) {
    return NextResponse.json(
      {
        error:
          referenceError,
      },
      {
        status: 400,
      },
    );
  }

  const {
    data,
    error,
  } = await supabaseAdmin()
    .from("tasks")
    .insert({
      account_id:
        accountId,
      created_by:
        guard.userId,
      title,
      description:
        typeof payload.description ===
        "string"
          ? payload.description
          : null,
      priority,
      status: "pending",
      due_at:
        dueAt,
      assigned_to:
        payload.assigned_to ||
        null,
      contact_id:
        payload.contact_id ||
        null,
      conversation_id:
        payload.conversation_id ||
        null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json(
    {
      task: data,
    },
    {
      status: 201,
    },
  );
}
