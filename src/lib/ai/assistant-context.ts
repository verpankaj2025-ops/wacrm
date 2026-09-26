import type {
  AccountContext,
} from "@/lib/auth/account";
import {
  formatCustomerMemoryContext,
  getCustomerMemories,
} from "@/lib/customer-memory";
import type {
  AIConversationMessage,
  AIContext,
} from "./types";

type ConversationContextRow = {
  id: string
  account_id: string
  contact_id: string
  status: string
  control_mode:
    | "ai"
    | "human"
    | "paused"
}

type ContactContextRow = {
  id: string
  account_id: string
  name?: string | null
  lead_score?: number | null
  lead_score_band?:
    | "low"
    | "medium"
    | "high"
    | null
  conversation_stage?: string | null
}

export interface LoadedAIAssistantContext
  extends AIContext {
  conversationId: string;
  contactId: string;
  controlMode: "ai" | "human" | "paused";
  status: string;
}

export function canUseAIAssistant(args: {
  controlMode: string | null | undefined;
  status: string | null | undefined;
}): boolean {
  return (
    args.controlMode === "ai" &&
    args.status !== "closed"
  );
}

export function formatConversationHistory(
  messages: AIConversationMessage[],
): string {
  if (!messages.length) {
    return "No previous conversation messages.";
  }

  return messages
    .slice(-12)
    .map((message) => {
      const speaker =
        message.sender_type === "customer"
          ? "Customer"
          : message.sender_type === "agent"
            ? "Agent"
            : "Assistant";

      return `${speaker}: ${
        message.content_text?.trim() ||
        "(non-text message)"
      }`;
    })
    .join("\n");
}

export async function loadAIAssistantContext(
  ctx: AccountContext,
  conversationId: string,
): Promise<LoadedAIAssistantContext> {
  const {
    data: rawConversation,
    error: conversationError,
  } = await ctx.supabase
    .from("conversations")
    .select(
      [
        "id",
        "account_id",
        "contact_id",
        "status",
        "control_mode",
      ].join(","),
    )
    .eq(
      "id",
      conversationId,
    )
    .eq(
      "account_id",
      ctx.accountId,
    )
    .maybeSingle();

  const conversation =
    rawConversation as unknown as
      ConversationContextRow | null;

  if (
    conversationError ||
    !conversation
  ) {
    throw new Error(
      "Conversation not found",
    );
  }

  const {
    data: rawContact,
    error: contactError,
  } = await ctx.supabase
    .from("contacts")
    .select(
      [
        "id",
        "account_id",
        "name",
        "lead_score",
        "lead_score_band",
        "conversation_stage",
      ].join(","),
    )
    .eq(
      "id",
      conversation.contact_id,
    )
    .eq(
      "account_id",
      ctx.accountId,
    )
    .maybeSingle();

  const contact =
    rawContact as unknown as
      ContactContextRow | null;

  if (
    contactError ||
    !contact
  ) {
    throw new Error(
      "Conversation contact not found",
    );
  }

  const {
    data: messages,
    error: messagesError,
  } = await ctx.supabase
    .from("messages")
    .select(
      [
        "sender_type",
        "content_text",
        "created_at",
      ].join(","),
    )
    .eq(
      "conversation_id",
      conversationId,
    )
    .order(
      "created_at",
      {
        ascending: false,
      },
    )
    .limit(12);

  if (messagesError) {
    throw new Error(
      `Conversation history unavailable: ${messagesError.message}`,
    );
  }

  const memories =
    await getCustomerMemories(
      ctx.accountId,
      contact.id,
    );

  return {
    conversationId:
      conversation.id,
    contactId:
      contact.id,
    controlMode:
      conversation.control_mode,
    status:
      conversation.status,
    customerName:
      contact.name ?? null,
    leadScore:
      typeof contact.lead_score ===
      "number"
        ? contact.lead_score
        : null,
    leadScoreBand:
      contact.lead_score_band ??
      null,
    conversationStage:
      contact.conversation_stage ??
      null,
    memoryContext:
      formatCustomerMemoryContext(
        memories,
      ),
    recentMessages:
      ((messages ?? []) as unknown as AIConversationMessage[])
        .reverse(),
  };
}
