export const CONVERSATION_CONTROL_MODES = [
  "ai",
  "human",
  "paused",
] as const

export type ConversationControlMode =
  (typeof CONVERSATION_CONTROL_MODES)[number]

export const CONVERSATION_CONTROL_ACTIONS = [
  "handoff",
  "pause_ai",
  "resume_ai",
  "claim",
  "release",
  "assign",
  "unassign",
  "close",
  "reopen",
  "set_status",
] as const

export type ConversationControlAction =
  (typeof CONVERSATION_CONTROL_ACTIONS)[number]

export function isConversationControlMode(
  value: unknown,
): value is ConversationControlMode {
  return (
    typeof value === "string" &&
    (
      CONVERSATION_CONTROL_MODES as readonly string[]
    ).includes(value)
  )
}

export function isConversationControlAction(
  value: unknown,
): value is ConversationControlAction {
  return (
    typeof value === "string" &&
    (
      CONVERSATION_CONTROL_ACTIONS as readonly string[]
    ).includes(value)
  )
}

export function isConversationLifecycleStatus(
  value: unknown,
): value is "open" | "pending" | "closed" {
  return (
    value === "open" ||
    value === "pending" ||
    value === "closed"
  )
}

export function canReleaseConversationLock(
  lockedBy: string | null | undefined,
  actorUserId: string,
  actorIsAdmin: boolean,
): boolean {
  if (!lockedBy) return true
  if (lockedBy === actorUserId) return true
  return actorIsAdmin
}

export function controlModeLabel(
  mode: ConversationControlMode,
): string {
  switch (mode) {
    case "ai":
      return "AI"
    case "human":
      return "Human"
    case "paused":
      return "Paused"
  }
}
