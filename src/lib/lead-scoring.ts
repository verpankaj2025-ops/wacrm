import { supabaseAdmin } from "@/lib/automations/admin-client"

export type LeadScoreBand =
  | "low"
  | "medium"
  | "high"

export interface LeadScoringSignals {
  lead_status?: string | null
  qualification_completed?: boolean | null
  conversation_stage?: string | null
  preferred_service?: string | null
  requirement?: string | null
  location?: string | null
  city?: string | null
  service_area?: string | null
  pending_intent?: string | null
  lead_source?: string | null
  last_ai_message_at?: string | null
  current_intent?: string | null
}

export interface LeadScoreResult {
  score: number
  band: LeadScoreBand
  reasons: string[]
}

function hasValue(
  value?: string | null,
): boolean {
  return Boolean(
    value &&
      value.trim().length > 0,
  )
}

function normalized(
  value?: string | null,
): string {
  return (
    value?.trim().toLowerCase() ?? ""
  )
}

function hasMeaningfulLocation(
  location?: string | null,
  city?: string | null,
  serviceArea?: string | null,
): boolean {
  const values = [
    location,
    city,
    serviceArea,
  ]
    .map(normalized)
    .filter(Boolean)

  if (!values.length) {
    return false
  }

  const invalidValues = new Set([
    "unknown",
    "outside",
    "inside?",
    "not",
    "n/a",
    "na",
    "none",
    "null",
    "undefined",
    "hello",
    "hi",
    "hii",
    "hey",
    "yes",
    "no",
    "ok",
    "okay",
    "nothing",
    "kal",
    "aaj",
    "abhi",
    "hnji",
    "nji",
    ".",
    "-",
  ])

  const conversationalMarkers = [
    "vacancy",
    "manager",
    "talk to",
    "talk",
    "tell",
    "reply",
    "other services",
    "any other services",
    "booking",
    "massage",
    "price",
    "offer",
    "available",
  ]

  const locationMarkers = [
    "lucknow",
    "gomti",
    "nagar",
    "vihar",
    "puram",
    "chowk",
    "chowrah",
    "market",
    "sector",
    "phase",
    "road",
    "street",
    "colony",
    "extension",
    "near ",
    "opp ",
    "opposite ",
    "behind ",
    "front of ",
  ]

  const meaningful = values.filter(
    (value) => {
      if (invalidValues.has(value)) {
        return false
      }

      if (
        conversationalMarkers.some(
          (marker) =>
            value.includes(marker),
        )
      ) {
        return false
      }

      if (
        locationMarkers.some(
          (marker) =>
            value.includes(marker),
        )
      ) {
        return true
      }

      // Free-form values without a location cue are not
      // reliable enough to receive location points.
      return false
    },
  )

  return meaningful.length > 0
}

function add(
  reasons: string[],
  points: number,
  reason: string,
): number {
  reasons.push(
    `+${points}: ${reason}`,
  )
  return points
}

function recencyPoints(
  timestamp?: string | null,
): { points: number; reason: string } {
  if (!timestamp) {
    return {
      points: 0,
      reason: "",
    }
  }

  const time =
    new Date(timestamp).getTime()

  if (!Number.isFinite(time)) {
    return {
      points: 0,
      reason: "",
    }
  }

  const age =
    Date.now() - time

  const oneDay =
    24 * 60 * 60 * 1000

  const sevenDays =
    7 * oneDay

  if (age <= oneDay) {
    return {
      points: 5,
      reason:
        "recent AI/customer interaction",
    }
  }

  if (age <= sevenDays) {
    return {
      points: 2,
      reason:
        "recent interaction within 7 days",
    }
  }

  return {
    points: 0,
    reason: "",
  }
}

export function calculateLeadScore(
  signals: LeadScoringSignals,
): LeadScoreResult {
  let score = 0
  const reasons: string[] = []

  if (
    signals.qualification_completed
  ) {
    score += add(
      reasons,
      20,
      "qualification completed",
    )
  }

  if (
    hasValue(
      signals.preferred_service,
    )
  ) {
    score += add(
      reasons,
      15,
      "preferred service identified",
    )
  }

  if (
    hasValue(
      signals.requirement,
    )
  ) {
    score += add(
      reasons,
      15,
      "customer requirement identified",
    )
  }

  if (
    hasMeaningfulLocation(
      signals.location,
      signals.city,
      signals.service_area,
    )
  ) {
    score += add(
      reasons,
      10,
      "meaningful location/service area identified",
    )
  }

  const currentIntent =
    normalized(
      signals.current_intent,
    )

  const pendingIntent =
    normalized(
      signals.pending_intent,
    )

  const intent =
    currentIntent ||
    pendingIntent

  if (
    intent ===
      "book_appointment" ||
    intent ===
      "book_appointment_request" ||
    intent === "booking" ||
    intent === "book"
  ) {
    score += add(
      reasons,
      20,
      "appointment booking intent",
    )
  } else if (
    intent === "price_query" ||
    intent === "price"
  ) {
    score += add(
      reasons,
      15,
      "pricing intent",
    )
  } else if (
    intent ===
      "membership_query" ||
    intent === "membership"
  ) {
    score += add(
      reasons,
      15,
      "membership intent",
    )
  } else if (
    intent === "service_query" ||
    intent === "service"
  ) {
    score += add(
      reasons,
      10,
      "service interest",
    )
  } else if (
    intent === "followup_request" ||
    intent === "followup"
  ) {
    score += add(
      reasons,
      8,
      "follow-up requested",
    )
  } else if (
    intent ===
      "therapist_photo_request"
  ) {
    score += add(
      reasons,
      6,
      "therapist preference expressed",
    )
  }

  const stage =
    normalized(
      signals.conversation_stage,
    )

  if (
    stage.includes(
      "appointment",
    ) ||
    stage.includes("booking")
  ) {
    score += add(
      reasons,
      15,
      "conversation reached appointment/booking stage",
    )
  } else if (
    stage.includes("interested")
  ) {
    score += add(
      reasons,
      10,
      "interested conversation stage",
    )
  } else if (
    stage.includes("contacted")
  ) {
    score += add(
      reasons,
      5,
      "contacted conversation stage",
    )
  }

  if (
    normalized(
      signals.lead_status,
    ) === "qualified"
  ) {
    score += add(
      reasons,
      10,
      "lead marked qualified",
    )
  }

  const recent =
    recencyPoints(
      signals.last_ai_message_at,
    )

  if (recent.points > 0) {
    score += add(
      reasons,
      recent.points,
      recent.reason,
    )
  }

  score = Math.max(
    0,
    Math.min(100, score),
  )

  let band: LeadScoreBand

  if (score >= 70) {
    band = "high"
  } else if (score >= 40) {
    band = "medium"
  } else {
    band = "low"
  }

  return {
    score,
    band,
    reasons,
  }
}

export async function recalculateLeadScore(
  args: {
    accountId: string
    contactId: string
    currentIntent?: string | null
  },
): Promise<LeadScoreResult> {
  const { data, error } =
    await supabaseAdmin()
      .from("contacts")
      .select(
        [
          "lead_status",
          "qualification_completed",
          "conversation_stage",
          "preferred_service",
          "requirement",
          "location",
          "city",
          "service_area",
          "pending_intent",
          "lead_source",
          "last_ai_message_at",
        ].join(","),
      )
      .eq(
        "id",
        args.contactId,
      )
      .eq(
        "account_id",
        args.accountId,
      )
      .single()

  if (error || !data) {
    throw new Error(
      error?.message ??
        "Contact not found for lead scoring",
    )
  }

  const contactSignals =
    data as unknown as LeadScoringSignals

  const result =
    calculateLeadScore({
      ...contactSignals,
      current_intent:
        args.currentIntent,
    })

  const { error: updateError } =
    await supabaseAdmin()
      .from("contacts")
      .update({
        lead_score:
          result.score,
        lead_score_band:
          result.band,
        lead_score_reasons:
          result.reasons,
        lead_score_updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        args.contactId,
      )
      .eq(
        "account_id",
        args.accountId,
      )

  if (updateError) {
    throw new Error(
      `Failed to persist lead score: ${updateError.message}`,
    )
  }

  return result
}
