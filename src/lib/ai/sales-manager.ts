export type SalesManagerAction =
  | "HUMAN_HANDOFF"
  | "BOOKING_READY"
  | "COMPLETE_BOOKING_DETAILS"
  | "FOLLOW_UP"
  | "QUALIFY_LEAD"
  | "NURTURE"
  | "NO_ACTION"

export type SalesManagerPriority =
  | "critical"
  | "high"
  | "medium"
  | "low"

export interface SalesManagerInput {
  salesStage:
    | "service"
    | "date"
    | "time"
    | "name"
    | "confirmation"
    | "booked"
    | "handoff"

  service?: string | null
  date?: string | null
  time?: string | null
  customerName?: string | null

  bookingConfirmed: boolean

  leadScore?: number | null
  leadScoreBand?:
    | "low"
    | "medium"
    | "high"
    | "hot"
    | null

  lastQuestion?: string | null

  hoursSinceCustomerMessage?: number | null
  followupActive?: boolean

  conversationControlMode?:
    | "ai"
    | "human"
    | "paused"
    | null
}

export interface SalesManagerDecision {
  action: SalesManagerAction
  priority: SalesManagerPriority
  reason: string
  nextStep: string
}

export function getSalesManagerDecision(
  input: SalesManagerInput,
): SalesManagerDecision {
  if (
    input.conversationControlMode === "human" ||
    input.salesStage === "handoff"
  ) {
    return {
      action: "HUMAN_HANDOFF",
      priority: "critical",
      reason:
        "Conversation is under human control or requires human support.",
      nextStep:
        "Keep automated sales actions paused until a teammate releases the conversation.",
    }
  }

  if (
    input.conversationControlMode === "paused"
  ) {
    return {
      action: "NO_ACTION",
      priority: "low",
      reason:
        "AI automation is currently paused for this conversation.",
      nextStep:
        "Do not send or schedule automated sales action while AI is paused.",
    }
  }

  if (
    input.bookingConfirmed ||
    input.salesStage === "booked"
  ) {
    return {
      action: "NO_ACTION",
      priority: "low",
      reason:
        "Booking is already confirmed.",
      nextStep:
        "Do not create another booking. Move to post-booking follow-up.",
    }
  }

  if (
    input.followupActive
  ) {
    const score =
      input.leadScore ?? 0

    return {
      action: "FOLLOW_UP",
      priority:
        score >= 70
          ? "high"
          : "medium",
      reason:
        "A follow-up sequence is already active.",
      nextStep:
        "Continue the existing follow-up sequence; do not start a duplicate sequence.",
    }
  }

  if (
    input.hoursSinceCustomerMessage !==
      null &&
    input.hoursSinceCustomerMessage !==
      undefined &&
    input.hoursSinceCustomerMessage >=
      24
  ) {
    const score =
      input.leadScore ?? 0

    return {
      action: "FOLLOW_UP",
      priority:
        score >= 70
          ? "high"
          : "medium",
      reason:
        "Customer has been inactive for at least 24 hours.",
      nextStep:
        "Start or resume the appropriate follow-up sequence.",
    }
  }

  const bookingComplete =
    Boolean(
      input.service?.trim() &&
      input.date?.trim() &&
      input.time?.trim(),
    )

  if (
    input.salesStage ===
      "confirmation" &&
    bookingComplete
  ) {
    return {
      action: "BOOKING_READY",
      priority: "high",
      reason:
        "All booking details are available and the customer is at confirmation stage.",
      nextStep:
        "Wait for explicit confirmation, then create the appointment.",
    }
  }

  if (!bookingComplete) {
    const score =
      input.leadScore ?? 0

    return {
      action:
        "COMPLETE_BOOKING_DETAILS",
      priority:
        score >= 70
          ? "high"
          : "medium",
      reason:
        "Booking information is incomplete.",
      nextStep:
        "Ask only for the next missing booking detail.",
    }
  }

  const score =
    input.leadScore ?? 0

  if (
    score >= 70
  ) {
    return {
      action: "QUALIFY_LEAD",
      priority: "high",
      reason:
        "Lead score is high but the conversation is not yet at booking confirmation.",
      nextStep:
        "Prioritize qualification and move the lead toward booking.",
    }
  }

  if (
    score >= 40
  ) {
    return {
      action: "QUALIFY_LEAD",
      priority: "medium",
      reason:
        "Lead has meaningful engagement but is not yet booking-ready.",
      nextStep:
        "Collect missing intent, service or timing information.",
    }
  }

  return {
    action: "NURTURE",
    priority: "low",
    reason:
      "Lead is currently low intent.",
    nextStep:
      "Keep the conversation open without aggressive sales action.",
  }
}

