import {
  describe,
  expect,
  it,
} from "vitest"

import {
  extractSalesSignals,
} from "./sales-signal-extractor"

describe(
  "sales signal extraction",
  () => {
    it(
      "extracts service",
      () => {
        expect(
          extractSalesSignals(
            "I want Aroma Therapy",
          ).service,
        ).toBe(
          "Aroma Therapy",
        )
      },
    )

    it(
      "extracts tomorrow date",
      () => {
        const result =
          extractSalesSignals(
            "I want to book tomorrow",
          )

        expect(
          result.date,
        ).toMatch(
          /^20\d{2}-\d{2}-\d{2}$/,
        )
      },
    )

    it(
      "extracts time",
      () => {
        expect(
          extractSalesSignals(
            "tomorrow at 7:30 PM",
          ).time,
        ).toBe(
          "19:30",
        )
      },
    )

    it(
      "extracts 24 hour time",
      () => {
        expect(
          extractSalesSignals(
            "at 18:45",
          ).time,
        ).toBe(
          "18:45",
        )
      },
    )

    it(
      "extracts customer name",
      () => {
        expect(
          extractSalesSignals(
            "My name is Rahul",
          ).customerName,
        ).toBe(
          "Rahul",
        )
      },
    )

    it(
      "extracts multiple sales fields",
      () => {
        const result =
          extractSalesSignals(
            "I want couple spa tomorrow at 7 PM. My name is Rahul",
          )

        expect(
          result.service,
        ).toBe(
          "Couple Spa Package",
        )

        expect(
          result.date,
        ).toMatch(
          /^20\d{2}-\d{2}-\d{2}$/,
        )

        expect(
          result.time,
        ).toBe(
          "19:00",
        )

        expect(
          result.customerName,
        ).toBe(
          "Rahul",
        )
      },
    )

    it(
      "does not treat generic chat as a service",
      () => {
        expect(
          extractSalesSignals(
            "Hello how are you",
          ),
        ).toEqual({})
      },
    )

    it(
      "does not invent a time",
      () => {
        expect(
          extractSalesSignals(
            "I want a massage tomorrow",
          ).time,
        ).toBeNull()
      },
    )
  },
)
