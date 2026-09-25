import {
  describe,
  expect,
  it,
} from "vitest"

import {
  canReleaseConversationLock,
  controlModeLabel,
  isConversationControlAction,
  isConversationControlMode,
  isConversationLifecycleStatus,
} from "./control"

describe(
  "conversation control",
  () => {
    it("accepts all control modes", () => {
      expect(isConversationControlMode("ai")).toBe(true)
      expect(isConversationControlMode("human")).toBe(true)
      expect(isConversationControlMode("paused")).toBe(true)
      expect(isConversationControlMode("invalid")).toBe(false)
    })

    it("accepts all control actions", () => {
      expect(isConversationControlAction("handoff")).toBe(true)
      expect(isConversationControlAction("claim")).toBe(true)
      expect(isConversationControlAction("release")).toBe(true)
      expect(isConversationControlAction("set_status")).toBe(true)
      expect(isConversationControlAction("invalid")).toBe(false)
    })

    it("validates lifecycle statuses", () => {
      expect(isConversationLifecycleStatus("open")).toBe(true)
      expect(isConversationLifecycleStatus("pending")).toBe(true)
      expect(isConversationLifecycleStatus("closed")).toBe(true)
      expect(isConversationLifecycleStatus("failed")).toBe(false)
    })

    it("allows the locker to release their own lock", () => {
      expect(
        canReleaseConversationLock(
          "user-1",
          "user-1",
          false,
        ),
      ).toBe(true)
    })

    it("allows admin to release another agent's lock", () => {
      expect(
        canReleaseConversationLock(
          "user-1",
          "user-2",
          true,
        ),
      ).toBe(true)
    })

    it("blocks a non-admin from releasing another agent's lock", () => {
      expect(
        canReleaseConversationLock(
          "user-1",
          "user-2",
          false,
        ),
      ).toBe(false)
    })

    it("maps control labels", () => {
      expect(controlModeLabel("ai")).toBe("AI")
      expect(controlModeLabel("human")).toBe("Human")
      expect(controlModeLabel("paused")).toBe("Paused")
    })
  },
)
