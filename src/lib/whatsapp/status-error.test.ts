import {
  describe,
  expect,
  it,
} from "vitest"

import {
  formatMetaStatusErrors,
} from "./status-error"

describe(
  "formatMetaStatusErrors",
  () => {
    it(
      "formats Meta code, title and details",
      () => {
        const result =
          formatMetaStatusErrors([
            {
              code: 131047,
              title:
                "Re-engagement message",
              error_data: {
                details:
                  "Recipient has not interacted recently.",
              },
            },
          ])

        expect(result).toContain(
          "131047",
        )

        expect(result).toContain(
          "Re-engagement message",
        )

        expect(result).toContain(
          "Recipient has not interacted recently.",
        )
      },
    )

    it(
      "falls back to message when title is absent",
      () => {
        const result =
          formatMetaStatusErrors([
            {
              code: 100,
              message:
                "Example Meta error",
            },
          ])

        expect(result).toBe(
          "code 100: Example Meta error",
        )
      },
    )

    it(
      "returns null for missing errors",
      () => {
        expect(
          formatMetaStatusErrors(
            undefined,
          ),
        ).toBeNull()

        expect(
          formatMetaStatusErrors([]),
        ).toBeNull()
      },
    )
  },
)
