import {
  describe,
  expect,
  it,
} from "vitest"

import {
  getSalesManagerDecision,
} from "./sales-manager"

describe(
  "AI Sales Manager",
  () => {
    it(
      "hands off human-controlled conversations",
      () => {
        expect(
          getSalesManagerDecision({
            salesStage: "service",
            bookingConfirmed: false,
            leadScore: 80,
            conversationControlMode:
              "human",
          }).action,
        ).toBe("HUMAN_HANDOFF")
      },
    )

    it(
      "does nothing for booked leads",
      () => {
        expect(
          getSalesManagerDecision({
            salesStage: "booked",
            bookingConfirmed: true,
            leadScore: 90,
            conversationControlMode:
              "ai",
          }).action,
        ).toBe("NO_ACTION")
      },
    )

    it(
      "marks complete confirmation as booking-ready",
      () => {
        const result =
          getSalesManagerDecision({
            salesStage:
              "confirmation",
            service:
              "Aroma Therapy",
            date:
              "2026-10-15",
            time:
              "19:00",
            bookingConfirmed:
              false,
            leadScore: 80,
            conversationControlMode:
              "ai",
          })

        expect(
          result.action,
        ).toBe("BOOKING_READY")

        expect(
          result.priority,
        ).toBe("high")
      },
    )

    it(
      "requests missing booking details",
      () => {
        expect(
          getSalesManagerDecision({
            salesStage:
              "date",
            service:
              "Aroma Therapy",
            date: null,
            time: null,
            bookingConfirmed:
              false,
            leadScore: 60,
            conversationControlMode:
              "ai",
          }).action,
        ).toBe(
          "COMPLETE_BOOKING_DETAILS",
        )
      },
    )

    it(
      "follows up when an active sequence exists",
      () => {
        expect(
          getSalesManagerDecision({
            salesStage:
              "service",
            bookingConfirmed:
              false,
            leadScore: 85,
            followupActive:
              true,
            conversationControlMode:
              "ai",
          }).action,
        ).toBe("FOLLOW_UP")
      },
    )

    it(
      "follows up after 24 hours",
      () => {
        expect(
          getSalesManagerDecision({
            salesStage:
              "service",
            bookingConfirmed:
              false,
            leadScore: 50,
            hoursSinceCustomerMessage:
              26,
            conversationControlMode:
              "ai",
          }).action,
        ).toBe("FOLLOW_UP")
      },
    )

    it(
      "qualifies a high scoring complete lead",
      () => {
        expect(
          getSalesManagerDecision({
            salesStage:
              "time",
            service:
              "Aroma Therapy",
            date:
              "2026-10-15",
            time:
              "19:00",
            bookingConfirmed:
              false,
            leadScore: 80,
            conversationControlMode:
              "ai",
          }).action,
        ).toBe("QUALIFY_LEAD")
      },
    )

    it(
      "nurtures a low intent complete lead",
      () => {
        expect(
          getSalesManagerDecision({
            salesStage:
              "time",
            service:
              "Aroma Therapy",
            date:
              "2026-10-15",
            time:
              "19:00",
            bookingConfirmed:
              false,
            leadScore: 10,
            conversationControlMode:
              "ai",
          }).action,
        ).toBe("NURTURE")
      },
    )
  },
)
