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

const ALLOWED_PRIORITIES =
  new Set([
    "low",
    "medium",
    "high",
  ]);

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

async function validateReferences(
  accountId: string,
  body: Record<string, unknown>,
) {
  const admin =
    supabaseAdmin();

  if (
    body.assigned_to !==
      undefined &&
    body.assigned_to !==
      null &&
    body.assigned_to !==
      ""
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
        body.assigned_to,
      )
      .maybeSingle();

    if (!profile) {
      return "Assigned team member is not part of this account.";
    }
  }

  if (
    body.contact_id !==
      undefined &&
    body.contact_id !==
      null &&
    body.contact_id !==
      ""
  ) {
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
        body.contact_id,
      )
      .maybeSingle();

    if (!contact) {
      return "Contact not found in this account.";
    }
  }

  if (
    body.conversation_id !==
      undefined &&
    body.conversation_id !==
      null &&
    body.conversation_id !==
      ""
  ) {
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
        body.conversation_id,
      )
      .maybeSingle();

    if (!conversation) {
      return "Conversation not found in this account.";
    }

    if (
      body.contact_id &&
      conversation.contact_id !==
        body.contact_id
    ) {
      return "Conversation does not belong to the selected contact.";
    }
  }

  return null;
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
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

  const { id } =
    await params;

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
    data: task,
  } = await supabaseAdmin()
    .from("tasks")
    .select(
      "id, account_id, status",
    )
    .eq("id", id)
    .maybeSingle();

  if (!task) {
    return NextResponse.json(
      {
        error:
          "Task not found",
      },
      {
        status: 404,
      },
    );
  }

  if (
    task.account_id !==
    accountId
  ) {
    return NextResponse.json(
      {
        error:
          "Forbidden",
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

  const updateData:
    Record<string, unknown> =
    {};

  if (
    payload.title !==
    undefined
  ) {
    if (
      typeof payload.title !==
      "string" ||
      !payload.title.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "title cannot be empty.",
        },
        {
          status: 400,
        },
      );
    }

    updateData.title =
      payload.title.trim();
  }

  if (
    payload.description !==
    undefined
  ) {
    updateData.description =
      payload.description;
  }

  if (
    payload.priority !==
    undefined
  ) {
    if (
      typeof payload.priority !==
        "string" ||
      !ALLOWED_PRIORITIES.has(
        payload.priority,
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

    updateData.priority =
      payload.priority;
  }

  if (
    payload.due_at !==
    undefined
  ) {
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

    updateData.due_at =
      dueAt;
  }

  if (
    payload.assigned_to !==
    undefined
  ) {
    updateData.assigned_to =
      payload.assigned_to ||
      null;
  }

  if (
    payload.contact_id !==
    undefined
  ) {
    updateData.contact_id =
      payload.contact_id ||
      null;
  }

  if (
    payload.conversation_id !==
    undefined
  ) {
    updateData.conversation_id =
      payload.conversation_id ||
      null;
  }

  if (
    payload.status !==
    undefined
  ) {
    const status =
      String(
        payload.status,
      );

    updateData.status =
      status;

    if (
      status ===
      "completed"
    ) {
      updateData.completed_at =
        new Date().toISOString();
    } else {
      updateData.completed_at =
        null;
    }
  }

  const referenceError =
    await validateReferences(
      accountId,
      {
        assigned_to:
          updateData.assigned_to,
        contact_id:
          updateData.contact_id,
        conversation_id:
          updateData.conversation_id,
      },
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

  updateData.updated_at =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabaseAdmin()
    .from("tasks")
    .update(updateData)
    .eq("id", id)
    .eq(
      "account_id",
      accountId,
    )
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

  return NextResponse.json({
    task: data,
  });
}

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
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

  const { id } =
    await params;

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
    data: task,
  } = await supabaseAdmin()
    .from("tasks")
    .select(
      "id, account_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!task) {
    return NextResponse.json(
      {
        error:
          "Task not found",
      },
      {
        status: 404,
      },
    );
  }

  if (
    task.account_id !==
    accountId
  ) {
    return NextResponse.json(
      {
        error:
          "Forbidden",
      },
      {
        status: 403,
      },
    );
  }

  const {
    error,
  } = await supabaseAdmin()
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq(
      "account_id",
      accountId,
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
    success: true,
  });
}
