import { supabaseAdmin } from "@/lib/automations/admin-client"
import {
  getSalesManagerDecision,
  type SalesManagerInput,
  type SalesManagerDecision,
} from "@/lib/ai/sales-manager"

type SalesManagerContactRow = {
  id: string
  name: string | null
  phone: string
  lead_status: string | null
  lead_score: number | null
  lead_score_band: string | null
  sales_stage: string | null
  sales_service: string | null
  sales_date: string | null
  sales_time: string | null
  sales_booking_confirmed: boolean | null
  sales_last_question: string | null
}

export interface SalesManagerCRMContext {
  contactId: string
  conversationId: string
  accountId: string
  contact: {
    name: string | null
    phone: string
    leadStatus: string | null
    leadScore: number | null
    leadScoreBand: SalesManagerInput["leadScoreBand"]
    salesStage: SalesManagerInput["salesStage"]
    salesService: string | null
    salesDate: string | null
    salesTime: string | null
    salesBookingConfirmed: boolean
    salesLastQuestion: string | null
  }
  conversation: {
    status: string
    controlMode:
      | "ai"
      | "human"
      | "paused"
      | null
  }
  latestCustomerMessageAt: string | null
  hoursSinceCustomerMessage: number | null
  followupActive: boolean
  nextFollowupAt: string | null
  decision: SalesManagerDecision
}

function normalizeSalesStage(
  value: unknown,
): SalesManagerInput["salesStage"] {
  switch (value) {
    case "date":
    case "time":
    case "name":
    case "confirmation":
    case "booked":
    case "handoff":
    case "service":
      return value
    default:
      return "service"
  }
}

function normalizeControlMode(
  value: unknown,
): "ai" | "human" | "paused" | null {
  if (
    value === "ai" ||
    value === "human" ||
    value === "paused"
  ) {
    return value
  }

  return null
}

export async function loadSalesManagerCRMContext(
  accountId: string,
  conversationId: string,
): Promise<SalesManagerCRMContext> {
  const admin = supabaseAdmin()

  const {
    data: conversation,
    error: conversationError,
  } = await admin
    .from("conversations")
    .select(
      "id,account_id,contact_id,status,control_mode",
    )
    .eq(
      "id",
      conversationId,
    )
    .eq(
      "account_id",
      accountId,
    )
    .maybeSingle()

  if (conversationError) {
    throw new Error(
      conversationError.message,
    )
  }

  if (!conversation) {
    throw new Error(
      "Conversation not found in this account.",
    )
  }

  if (!conversation.contact_id) {
    throw new Error(
      "Conversation has no contact.",
    )
  }

  const {
    data: contactData,
    error: contactError,
  } = await admin
    .from("contacts")
    .select(
      "id,name,phone,lead_status,lead_score,lead_score_band,sales_stage,sales_service,sales_date,sales_time,sales_booking_confirmed,sales_last_question",
    )
    .eq(
      "id",
      conversation.contact_id,
    )
    .eq(
      "account_id",
      accountId,
    )
    .maybeSingle()

  const contact =
    contactData as SalesManagerContactRow | null

  if (contactError) {
    throw new Error(
      contactError.message,
    )
  }

  if (!contact) {
    throw new Error(
      "Contact not found in this account.",
    )
  }

  const {
    data: latestMessage,
    error: messageError,
  } = await admin
    .from("messages")
    .select("created_at")
    .eq(
      "conversation_id",
      conversationId,
    )
    .eq(
      "sender_type",
      "customer",
    )
    .order(
      "created_at",
      {
        ascending: false,
      },
    )
    .limit(1)
    .maybeSingle()

  if (messageError) {
    throw new Error(
      messageError.message,
    )
  }

  const {
    data: activeFollowup,
    error: followupError,
  } = await admin
    .from("automation_enrollments")
    .select(
      "id,status,next_run_at,current_step_position",
    )
    .eq(
      "account_id",
      accountId,
    )
    .eq(
      "contact_id",
      contact.id,
    )
    .eq(
      "status",
      "active",
    )
    .order(
      "next_run_at",
      {
        ascending: true,
      },
    )
    .limit(1)
    .maybeSingle()

  if (followupError) {
    throw new Error(
      followupError.message,
    )
  }

  const latestCustomerMessageAt =
    latestMessage?.created_at ??
    null

  const hoursSinceCustomerMessage =
    latestCustomerMessageAt
      ? Math.max(
          0,
          (
            Date.now() -
            new Date(
              latestCustomerMessageAt,
            ).getTime()
          ) /
            3_600_000,
        )
      : null

  const leadScoreBand =
    contact.lead_score_band === "low" ||
    contact.lead_score_band === "medium" ||
    contact.lead_score_band === "high" ||
    contact.lead_score_band === "hot"
      ? contact.lead_score_band
      : null

  const managerInput:
    SalesManagerInput = {
      salesStage:
        normalizeSalesStage(
          contact.sales_stage,
        ),
      service:
        contact.sales_service ??
        null,
      date:
        contact.sales_date ??
        null,
      time:
        contact.sales_time ??
        null,
      customerName:
        contact.name ??
        null,
      bookingConfirmed:
        Boolean(
          contact.sales_booking_confirmed,
        ),
      leadScore:
        typeof contact.lead_score ===
        "number"
          ? contact.lead_score
          : null,
      leadScoreBand,
      lastQuestion:
        contact.sales_last_question ??
        null,
      hoursSinceCustomerMessage,
      followupActive:
        Boolean(activeFollowup),
      conversationControlMode:
        normalizeControlMode(
          conversation.control_mode,
        ) ?? null,
    }

  return {
    contactId:
      contact.id,
    conversationId:
      conversation.id,
    accountId,
    contact: {
      name:
        contact.name ??
        null,
      phone:
        contact.phone,
      leadStatus:
        contact.lead_status ??
        null,
      leadScore:
        managerInput.leadScore ??
        null,
      leadScoreBand:
        managerInput.leadScoreBand ??
        null,
      salesStage:
        managerInput.salesStage,
      salesService:
        managerInput.service ??
        null,
      salesDate:
        managerInput.date ??
        null,
      salesTime:
        managerInput.time ??
        null,
      salesBookingConfirmed:
        managerInput.bookingConfirmed,
      salesLastQuestion:
        managerInput.lastQuestion ??
        null,
    },
    conversation: {
      status:
        conversation.status,
      controlMode:
        managerInput.conversationControlMode ??
        null,
    },
    latestCustomerMessageAt,
    hoursSinceCustomerMessage,
    followupActive:
      Boolean(activeFollowup),
    nextFollowupAt:
      activeFollowup?.next_run_at ??
      null,
    decision:
      getSalesManagerDecision(
        managerInput,
      ),
  }
}
