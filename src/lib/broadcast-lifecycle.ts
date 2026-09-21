
export const BROADCAST_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
  "failed",
] as const

export const RECIPIENT_STATUSES = [
  "pending",
  "sent",
  "delivered",
  "read",
  "replied",
  "cancelled",
  "failed",
] as const

export function canCancelBroadcast(
  status: string,
) {
  return (
    status === "draft" ||
    status === "scheduled" ||
    status === "sending"
  )
}
