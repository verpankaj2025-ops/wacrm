import {
  describe,
  expect,
  it,
} from "vitest"

import {
  buildAIAppointmentKey,
  buildSalesBookingWindow,
  getSalesServiceDurationMinutes,
  isExplicitBookingConfirmation,
  normalizeSalesService,
  shouldCreateSalesBooking,
} from "./sales-booking"

describe(
  "AI sales booking",
  () => {
    it(
      "accepts explicit confirmations",
      () => {
        expect(
          isExplicitBookingConfirmation(
            "haan",
          ),
        ).toBe(true)

        expect(
          isExplicitBookingConfirmation(
            "Book it",
          ),
        ).toBe(true)

        expect(
          isExplicitBookingConfirmation(
            "confirm kardo",
          ),
        ).toBe(true)
      },
    )

    it(
      "rejects negative or ambiguous confirmations",
      () => {
        expect(
          isExplicitBookingConfirmation(
            "no",
          ),
        ).toBe(false)

        expect(
          isExplicitBookingConfirmation(
            "abhi nahi",
          ),
        ).toBe(false)

        expect(
          isExplicitBookingConfirmation(
            "maybe",
          ),
        ).toBe(false)
      },
    )

    it(
      "normalizes service aliases",
      () => {
        expect(
          normalizeSalesService(
            "aromatherapy",
          ),
        ).toBe(
          "Aroma Therapy",
        )

        expect(
          normalizeSalesService(
            "thai",
          ),
        ).toBe(
          "Thai Massage",
        )
      },
    )

    it(
      "uses service duration",
      () => {
        expect(
          getSalesServiceDurationMinutes(
            "Couple Spa Package",
          ),
        ).toBe(90)

        expect(
          getSalesServiceDurationMinutes(
            "Aroma Therapy",
          ),
        ).toBe(60)
      },
    )

    it(
      "builds an IST appointment window",
      () => {
        const result =
          buildSalesBookingWindow(
            "2026-10-05",
            "19:00",
            60,
          )

        expect(
          result.startAt,
        ).toBe(
          "2026-10-05T13:30:00.000Z",
        )

        expect(
          result.endAt,
        ).toBe(
          "2026-10-05T14:30:00.000Z",
        )
      },
    )

    it(
      "creates deterministic booking keys",
      () => {
        const args = {
          accountId:
            "account-1",
          contactId:
            "contact-1",
          conversationId:
            "conversation-1",
          startAt:
            "2026-10-05T13:30:00.000Z",
        }

        expect(
          buildAIAppointmentKey(
            args,
          ),
        ).toBe(
          buildAIAppointmentKey(
            args,
          ),
        )

        expect(
          buildAIAppointmentKey(
            args,
          ),
        ).toMatch(
          /^ai_[a-f0-9]{64}$/,
        )

        expect(
          buildAIAppointmentKey({
            ...args,
            startAt:
              "2026-10-05T14:30:00.000Z",
          }),
        ).not.toBe(
          buildAIAppointmentKey(
            args,
          ),
        )
      },
    )

    it(
      "books only when all required fields and explicit confirmation are present",
      () => {
        expect(
          shouldCreateSalesBooking({
            message: "haan",
            service:
              "Aroma Therapy",
            date:
              "2027-01-15",
            time:
              "19:00",
            bookingConfirmed:
              false,
          }),
        ).toBe(true)
      },
    )

    it(
      "does not book ambiguous confirmation",
      () => {
        expect(
          shouldCreateSalesBooking({
            message: "maybe",
            service:
              "Aroma Therapy",
            date:
              "2027-01-15",
            time:
              "19:00",
            bookingConfirmed:
              false,
          }),
        ).toBe(false)
      },
    )

    it(
      "does not book when required information is missing",
      () => {
        expect(
          shouldCreateSalesBooking({
            message: "haan",
            service:
              "Aroma Therapy",
            date:
              "2027-01-15",
            time:
              null,
            bookingConfirmed:
              false,
          }),
        ).toBe(false)
      },
    )

    it(
      "does not re-book an already confirmed sales state",
      () => {
        expect(
          shouldCreateSalesBooking({
            message: "haan",
            service:
              "Aroma Therapy",
            date:
              "2027-01-15",
            time:
              "19:00",
            bookingConfirmed:
              true,
          }),
        ).toBe(false)
      },
    )

  },
)
