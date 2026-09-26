import {
  describe,
  expect,
  it,
} from "vitest"

import {
  buildSalesContext,
  deriveSalesStage,
  getMissingSalesField,
  getNextSalesQuestion,
  isSalesStage,
  type SalesState,
} from "./sales-state"

describe(
  "AI sales state",
  () => {
    it(
      "starts at service stage",
      () => {
        const state: SalesState = {
          stage: "service",
          bookingConfirmed:
            false,
        }

        expect(
          deriveSalesStage(state),
        ).toBe("service")

        expect(
          getMissingSalesField(
            state,
          ),
        ).toBe("service")
      },
    )

    it(
      "moves to date after service",
      () => {
        const state: SalesState = {
          stage: "service",
          service:
            "Aroma Therapy",
          bookingConfirmed:
            false,
        }

        expect(
          deriveSalesStage(state),
        ).toBe("date")
      },
    )

    it(
      "moves to time after service and date",
      () => {
        const state: SalesState = {
          stage: "service",
          service:
            "Aroma Therapy",
          date:
            "2026-10-05",
          bookingConfirmed:
            false,
        }

        expect(
          deriveSalesStage(state),
        ).toBe("time")
      },
    )

    it(
      "moves to name after date and time",
      () => {
        const state: SalesState = {
          stage: "service",
          service:
            "Aroma Therapy",
          date:
            "2026-10-05",
          time:
            "18:00",
          bookingConfirmed:
            false,
        }

        expect(
          deriveSalesStage(state),
        ).toBe("name")
      },
    )

    it(
      "moves to confirmation after all booking fields",
      () => {
        const state: SalesState = {
          stage: "name",
          service:
            "Aroma Therapy",
          date:
            "2026-10-05",
          time:
            "18:00",
          customerName:
            "Rahul",
          bookingConfirmed:
            false,
        }

        expect(
          deriveSalesStage(state),
        ).toBe("confirmation")

        expect(
          getMissingSalesField(
            state,
          ),
        ).toBe(
          "confirmation",
        )
      },
    )

    it(
      "moves to booked only after explicit confirmation",
      () => {
        const state: SalesState = {
          stage:
            "confirmation",
          service:
            "Aroma Therapy",
          date:
            "2026-10-05",
          time:
            "18:00",
          customerName:
            "Rahul",
          bookingConfirmed:
            true,
        }

        expect(
          deriveSalesStage(state),
        ).toBe("booked")

        expect(
          getMissingSalesField(
            state,
          ),
        ).toBeNull()
      },
    )

    it(
      "returns the next question",
      () => {
        expect(
          getNextSalesQuestion({
            stage: "service",
            service:
              "Aroma Therapy",
            bookingConfirmed:
              false,
          }),
        ).toBe(
          "Kis date par visit karna chahenge?",
        )
      },
    )

    it(
      "recognizes valid stages",
      () => {
        expect(
          isSalesStage("service"),
        ).toBe(true)

        expect(
          isSalesStage("confirmation"),
        ).toBe(true)

        expect(
          isSalesStage("booked"),
        ).toBe(true)

        expect(
          isSalesStage("invalid"),
        ).toBe(false)
      },
    )

    it(
      "builds internal sales context",
      () => {
        const context =
          buildSalesContext({
            stage: "date",
            service:
              "Aroma Therapy",
            bookingConfirmed:
              false,
          })

        expect(
          context,
        ).toContain(
          "Sales stage: date",
        )

        expect(
          context,
        ).toContain(
          "Selected service: Aroma Therapy",
        )

        expect(
          context,
        ).toContain(
          "Next required field: date",
        )
      },
    )
  },
)
