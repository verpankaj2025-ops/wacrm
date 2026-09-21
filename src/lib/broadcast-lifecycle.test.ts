
import { describe, expect, it } from "vitest"
import { canCancelBroadcast } from "./broadcast-lifecycle"

describe("broadcast lifecycle", () => {
  it("allows draft cancellation", () => {
    expect(canCancelBroadcast("draft")).toBe(true)
  })

  it("allows scheduled cancellation", () => {
    expect(canCancelBroadcast("scheduled")).toBe(true)
  })

  it("allows sending cancellation", () => {
    expect(canCancelBroadcast("sending")).toBe(true)
  })

  it("blocks sent cancellation", () => {
    expect(canCancelBroadcast("sent")).toBe(false)
  })

  it("blocks failed cancellation", () => {
    expect(canCancelBroadcast("failed")).toBe(false)
  })
})
