import { NextResponse } from "next/server"
import {
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account"
import {
  loadSalesManagerCRMContext,
} from "@/lib/ai/sales-manager-context"

export async function GET(
  request: Request,
) {
  try {
    const ctx =
      await requireRole("agent")

    const url =
      new URL(request.url)

    const conversationId =
      url.searchParams
        .get(
          "conversation_id",
        )
        ?.trim() ?? ""

    if (!conversationId) {
      return NextResponse.json(
        {
          error:
            "conversation_id is required",
        },
        {
          status: 400,
        },
      )
    }

    const result =
      await loadSalesManagerCRMContext(
        ctx.accountId,
        conversationId,
      )

    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
    )
  } catch (error) {
    return toErrorResponse(
      error,
    )
  }
}
