
import {
  describe,
  expect,
  it,
} from "vitest"

import {
  metaTemplateBroadcastError,
} from "./meta-template-availability"

describe(
  "Meta template availability",
  () => {
    it(
      "returns a clear error for a missing translation",
      () => {
        const message =
          metaTemplateBroadcastError(
            "hello_world",
            "en_US",
            {
              exists: false,
              approved: false,
            },
          )

        expect(
          message,
        ).toContain(
          "hello_world",
        )

        expect(
          message,
        ).toContain(
          "en_US",
        )

        expect(
          message,
        ).toContain(
          "Sync from Meta",
        )
      },
    )

    it(
      "returns a clear error for a non-approved template",
      () => {
        const message =
          metaTemplateBroadcastError(
            "welcome_msg",
            "en_US",
            {
              exists: true,
              approved: false,
              status:
                "PENDING",
            },
          )

        expect(
          message,
        ).toContain(
          "PENDING",
        )
      },
    )

    it(
      "returns null for an approved live template",
      () => {
        const message =
          metaTemplateBroadcastError(
            "welcome_msg",
            "en_US",
            {
              exists: true,
              approved: true,
              status:
                "APPROVED",
            },
          )

        expect(
          message,
        ).toBeNull()
      },
    )
  },
)
