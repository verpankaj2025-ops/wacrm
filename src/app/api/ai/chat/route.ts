import { NextResponse } from "next/server";

import {
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import {
  loadAIAssistantContext,
  canUseAIAssistant,
} from "@/lib/ai/assistant-context";
import { routeToAI } from "@/lib/ai/router";

export async function POST(
  request: Request,
) {
  try {
    const body =
      await request.json();

    const message =
      typeof body?.message ===
      "string"
        ? body.message.trim()
        : "";

    const conversationId =
      typeof body?.conversation_id ===
      "string"
        ? body.conversation_id.trim()
        : "";

    if (!message) {
      return NextResponse.json(
        {
          error:
            "message is required",
        },
        {
          status: 400,
        },
      );
    }

    if (!conversationId) {
      return NextResponse.json(
        {
          error:
            "conversation_id is required",
        },
        {
          status: 400,
        },
      );
    }

    const ctx =
      await requireRole("agent");

    const assistantContext =
      await loadAIAssistantContext(
        ctx,
        conversationId,
      );

    if (
      !canUseAIAssistant({
        controlMode:
          assistantContext.controlMode,
        status:
          assistantContext.status,
      })
    ) {
      return NextResponse.json(
        {
          error:
            assistantContext.status ===
            "closed"
              ? "AI assistant is unavailable for a closed conversation"
              : "AI assistant is paused while this conversation is under human control",
        },
        {
          status: 409,
        },
      );
    }

    const result =
      await routeToAI(
        message,
        assistantContext,
      );

    return NextResponse.json(
      result,
    );
  } catch (error) {
    return toErrorResponse(
      error,
    );
  }
}
