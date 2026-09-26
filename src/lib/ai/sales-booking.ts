import {
  createHash,
} from "node:crypto"

import {
  supabaseAdmin,
} from "@/lib/automations/admin-client"

export const SALES_TIMEZONE =
  "Asia/Kolkata"

const DURATION_BY_SERVICE: Record<
  string,
  number
> = {
  "Aroma Therapy": 60,
  "Deep Tissue Massage": 60,
  "Swedish Massage": 60,
  "Balinese Massage": 60,
  "Thai Massage": 60,
  "Couple Spa Package": 90,
  "Hot Stone Therapy": 60,
  "Signature Massage": 60,
}

export interface SalesBookingInput {
  accountId: string
  contactId: string
  conversationId: string
  createdByUserId: string
  service: string
  date: string
  time: string
  customerName?: string | null
  bookingConfirmed: boolean
}

export interface SalesBookingDecisionInput {
  message: string
  service?: string | null
  date?: string | null
  time?: string | null
  bookingConfirmed: boolean
}

export function shouldCreateSalesBooking(
  input: SalesBookingDecisionInput,
): boolean {
  if (
    input.bookingConfirmed
  ) {
    return false
  }

  if (
    !isExplicitBookingConfirmation(
      input.message,
    )
  ) {
    return false
  }

  return Boolean(
    input.service?.trim() &&
    input.date?.trim() &&
    input.time?.trim(),
  )
}

function clean(
  value?: string | null,
): string {
  return (
    value?.trim() ?? ""
  )
}

export function isExplicitBookingConfirmation(
  message: string,
): boolean {
  const value =
    message
      .trim()
      .toLowerCase()

  if (!value) {
    return false
  }

  if (
    /\b(no|not|later|maybe|abhi nahi|baad mein|baad me|don't|do not)\b/i.test(
      value,
    )
  ) {
    return false
  }

  return (
    /^(yes|yeah|yup|ok|okay|sure|confirm|confirmed|book|book it|done|haan|ha|han|ji|ji haan|kar do|book kar do|book kardo|confirm kar do|confirm kardo|theek hai|thik hai|bilkul|yes please|yes book it)$/i.test(
      value,
    ) ||
    /\b(confirm|confirmed|book it|book kar do|book kardo|confirm kar do|confirm kardo|kar do|haan ji)\b/i.test(
      value,
    )
  )
}

export function normalizeSalesService(
  service: string,
): string {
  const value =
    clean(service)
      .toLowerCase()

  const aliases: Record<
    string,
    string
  > = {
    "aroma":
      "Aroma Therapy",
    "aroma therapy":
      "Aroma Therapy",
    "aromatherapy":
      "Aroma Therapy",
    "deep tissue":
      "Deep Tissue Massage",
    "deep tissue massage":
      "Deep Tissue Massage",
    "swedish":
      "Swedish Massage",
    "swedish massage":
      "Swedish Massage",
    "balinese":
      "Balinese Massage",
    "balinese massage":
      "Balinese Massage",
    "thai":
      "Thai Massage",
    "thai massage":
      "Thai Massage",
    "couple":
      "Couple Spa Package",
    "couples":
      "Couple Spa Package",
    "couple spa":
      "Couple Spa Package",
    "couple spa package":
      "Couple Spa Package",
    "hot stone":
      "Hot Stone Therapy",
    "hot stone therapy":
      "Hot Stone Therapy",
    "signature":
      "Signature Massage",
    "signature massage":
      "Signature Massage",
  }

  return (
    aliases[value] ??
    service.trim()
  )
}

export function getSalesServiceDurationMinutes(
  service: string,
): number {
  return (
    DURATION_BY_SERVICE[
      normalizeSalesService(
        service,
      )
    ] ??
    60
  )
}

function assertIsoDate(
  date: string,
): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date,
    )
  ) {
    throw new Error(
      "Invalid sales booking date.",
    )
  }

  const parsed =
    new Date(
      `${date}T00:00:00Z`,
    )

  if (
    Number.isNaN(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(0, 10) !==
      date
  ) {
    throw new Error(
      "Invalid sales booking date.",
    )
  }
}

function assertTime(
  time: string,
): void {
  if (
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(
      time,
    )
  ) {
    throw new Error(
      "Invalid sales booking time.",
    )
  }
}

export function buildSalesBookingWindow(
  date: string,
  time: string,
  durationMinutes: number,
) {
  assertIsoDate(date)
  assertTime(time)

  if (
    !Number.isInteger(
      durationMinutes,
    ) ||
    durationMinutes <= 0
  ) {
    throw new Error(
      "Invalid appointment duration.",
    )
  }

  // Relaxio Spa operates on IST.
  const start =
    new Date(
      `${date}T${time}:00+05:30`,
    )

  if (
    Number.isNaN(start.getTime())
  ) {
    throw new Error(
      "Invalid sales booking start time.",
    )
  }

  const end =
    new Date(
      start.getTime() +
        durationMinutes *
          60 *
          1000,
    )

  return {
    startAt:
      start.toISOString(),
    endAt:
      end.toISOString(),
  }
}

export function buildAIAppointmentKey(
  args: {
    accountId: string
    contactId: string
    conversationId: string
    startAt: string
  },
): string {
  const raw = [
    args.accountId,
    args.contactId,
    args.conversationId,
    args.startAt,
  ].join("|")

  return (
    "ai_" +
    createHash(
      "sha256",
    )
      .update(raw)
      .digest("hex")
  )
}

async function findExistingByKey(
  accountId: string,
  bookingKey: string,
) {
  const {
    data,
    error,
  } = await supabaseAdmin()
    .from("appointments")
    .select("*")
    .eq(
      "account_id",
      accountId,
    )
    .eq(
      "ai_booking_key",
      bookingKey,
    )
    .maybeSingle()

  if (error) {
    throw new Error(
      error.message,
    )
  }

  return data ?? null
}

async function assertNoActiveContactConflict(
  args: {
    accountId: string
    contactId: string
    startAt: string
    endAt: string
  },
) {
  const {
    data,
    error,
  } = await supabaseAdmin()
    .from("appointments")
    .select(
      "id,start_at,end_at,status",
    )
    .eq(
      "account_id",
      args.accountId,
    )
    .eq(
      "contact_id",
      args.contactId,
    )
    .in("status", [
      "scheduled",
      "confirmed",
    ])
    .lt(
      "start_at",
      args.endAt,
    )
    .gt(
      "end_at",
      args.startAt,
    )
    .limit(1)

  if (error) {
    throw new Error(
      error.message,
    )
  }

  if (
    (data ?? []).length
  ) {
    throw new Error(
      "This contact already has another appointment in the selected time range.",
    )
  }
}

export async function createOrGetSalesAppointment(
  input: SalesBookingInput,
) {
  if (
    !input.bookingConfirmed
  ) {
    throw new Error(
      "Customer confirmation is required before booking.",
    )
  }

  const service =
    normalizeSalesService(
      input.service,
    )

  if (!service) {
    throw new Error(
      "Sales booking service is required.",
    )
  }

  if (!input.contactId) {
    throw new Error(
      "Sales booking contact is required.",
    )
  }

  if (!input.conversationId) {
    throw new Error(
      "Sales booking conversation is required.",
    )
  }

  const durationMinutes =
    getSalesServiceDurationMinutes(
      service,
    )

  const {
    startAt,
    endAt,
  } =
    buildSalesBookingWindow(
      input.date,
      input.time,
      durationMinutes,
    )

  const bookingKey =
    buildAIAppointmentKey({
      accountId:
        input.accountId,
      contactId:
        input.contactId,
      conversationId:
        input.conversationId,
      startAt,
    })

  const existing =
    await findExistingByKey(
      input.accountId,
      bookingKey,
    )

  if (existing) {
    return {
      appointment:
        existing,
      created: false,
      bookingKey,
      startAt,
      endAt,
    }
  }

  await assertNoActiveContactConflict({
    accountId:
      input.accountId,
    contactId:
      input.contactId,
    startAt,
    endAt,
  })

  const {
    data,
    error,
  } = await supabaseAdmin()
    .from("appointments")
    .insert({
      account_id:
        input.accountId,
      contact_id:
        input.contactId,
      conversation_id:
        input.conversationId,
      assigned_to:
        null,
      service_name:
        service,
      start_at:
        startAt,
      end_at:
        endAt,
      status:
        "scheduled",
      notes:
        input.customerName
          ? `AI Sales booking for ${input.customerName}`
          : "AI Sales booking",
      source:
        "ai_sales_agent",
      created_by:
        input.createdByUserId,
      ai_booking_key:
        bookingKey,
    })
    .select("*")
    .single()

  if (
    error
  ) {
    const raceWinner =
      await findExistingByKey(
        input.accountId,
        bookingKey,
      )

    if (raceWinner) {
      return {
        appointment:
          raceWinner,
        created: false,
        bookingKey,
        startAt,
        endAt,
      }
    }

    throw new Error(
      error.message,
    )
  }

  return {
    appointment:
      data,
    created: true,
    bookingKey,
    startAt,
    endAt,
  }
}

export async function markSalesBookingComplete(
  args: {
    accountId: string
    contactId: string
    appointmentId: string
  },
) {
  const {
    error,
  } = await supabaseAdmin()
    .from("contacts")
    .update({
      sales_stage:
        "booked",
      sales_booking_appointment_id:
        args.appointmentId,
      sales_booking_confirmed:
        true,
      sales_confirmation_at:
        new Date().toISOString(),
      sales_updated_at:
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

  if (error) {
    throw new Error(
      error.message,
    )
  }
}
