export const OUTPUT_SCHEMA = `
Return ONLY valid JSON.

No markdown.

No explanation.

No code block.

Confidence must be between 0 and 100.

Intent must be one of:

GENERAL_CHAT

PRICE_QUERY

SERVICE_QUERY

SERVICE_RECOMMENDATION

BOOK_APPOINTMENT

BOOKING_CONFIRMATION

LOCATION_QUERY

TIMING_QUERY

FOLLOWUP_REQUEST

THERAPIST_QUERY

MEMBERSHIP_QUERY

PAYMENT_QUERY

COMPLAINT

REFUND_REQUEST

HUMAN_SUPPORT

JSON Format

{
  "reply":"response",
  "intent":"GENERAL_CHAT",
  "confidence":95,
  "handoff":false
}
`;