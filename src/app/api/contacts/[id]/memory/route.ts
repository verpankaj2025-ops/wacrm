import {
  NextResponse,
} from "next/server"

import {
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account"

import {
  deleteCustomerMemory,
  getCustomerMemories,
  saveCustomerMemory,
} from "@/lib/customer-memory"

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const ctx =
      await requireRole("agent")

    const { id } =
      await context.params

    const { data: contact } =
      await ctx.supabase
        .from("contacts")
        .select("id")
        .eq("id", id)
        .eq("account_id", ctx.accountId)
        .maybeSingle()

    if (!contact) {
      return NextResponse.json(
        {
          error:
            "Contact not found",
        },
        { status: 404 },
      )
    }

    const memories =
      await getCustomerMemories(
        ctx.accountId,
        id,
      )

    return NextResponse.json({
      memories,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const ctx =
      await requireRole("agent")

    const { id } =
      await context.params

    const body =
      (await request
        .json()
        .catch(() => null)) as {
        key?: unknown
        value?: unknown
        value_type?: unknown
        confidence?: unknown
      } | null

    const key =
      typeof body?.key === "string"
        ? body.key.trim()
        : ""

    const value =
      typeof body?.value === "string"
        ? body.value.trim()
        : ""

    if (
      !key ||
      !value
    ) {
      return NextResponse.json(
        {
          error:
            "key and value are required",
        },
        { status: 400 },
      )
    }

    if (key.length > 100) {
      return NextResponse.json(
        {
          error:
            "Memory key is too long",
        },
        { status: 400 },
      )
    }

    if (value.length > 1000) {
      return NextResponse.json(
        {
          error:
            "Memory value is too long",
        },
        { status: 400 },
      )
    }

    const { data: contact } =
      await ctx.supabase
        .from("contacts")
        .select("id")
        .eq("id", id)
        .eq("account_id", ctx.accountId)
        .maybeSingle()

    if (!contact) {
      return NextResponse.json(
        {
          error:
            "Contact not found",
        },
        { status: 404 },
      )
    }

    const allowedTypes = new Set([
      "text",
      "number",
      "boolean",
      "date",
      "time",
    ])

    const valueType =
      typeof body?.value_type === "string" &&
      allowedTypes.has(
        body.value_type,
      )
        ? body.value_type
        : "text"

    const confidence =
      typeof body?.confidence ===
      "number"
        ? Math.max(
            0,
            Math.min(
              1,
              body.confidence,
            ),
          )
        : 1

    const memory =
      await saveCustomerMemory(
        ctx.accountId,
        id,
        {
          key,
          value,
          valueType:
            valueType as
              | "text"
              | "number"
              | "boolean"
              | "date"
              | "time",
          source: "agent",
          confidence,
        },
      )

    return NextResponse.json(
      {
        memory,
      },
      { status: 201 },
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  try {
    const ctx =
      await requireRole("agent")

    const { id } =
      await context.params

    const url =
      new URL(request.url)

    const memoryId =
      url.searchParams.get(
        "memory_id",
      )

    if (!memoryId) {
      return NextResponse.json(
        {
          error:
            "memory_id is required",
        },
        { status: 400 },
      )
    }

    const { data: contact } =
      await ctx.supabase
        .from("contacts")
        .select("id")
        .eq("id", id)
        .eq("account_id", ctx.accountId)
        .maybeSingle()

    if (!contact) {
      return NextResponse.json(
        {
          error:
            "Contact not found",
        },
        { status: 404 },
      )
    }

    await deleteCustomerMemory(
      ctx.accountId,
      id,
      memoryId,
    )

    return NextResponse.json({
      ok: true,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
