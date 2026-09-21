
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  appointmentDurationMs,
  canRebookAppointment,
  defaultRebookStart,
} from "./rebooking";

describe(
  "appointment rebooking",
  () => {
    it(
      "allows completed appointments",
      () => {
        expect(
          canRebookAppointment(
            "completed",
          ),
        ).toBe(true);
      },
    );

    it(
      "allows no-show appointments",
      () => {
        expect(
          canRebookAppointment(
            "no_show",
          ),
        ).toBe(true);
      },
    );

    it(
      "does not allow scheduled appointments",
      () => {
        expect(
          canRebookAppointment(
            "scheduled",
          ),
        ).toBe(false);
      },
    );

    it(
      "calculates the appointment duration",
      () => {
        const duration =
          appointmentDurationMs(
            "2026-09-21T10:00:00.000Z",
            "2026-09-21T11:30:00.000Z",
          );

        expect(
          duration,
        ).toBe(
          90 * 60 * 1000,
        );
      },
    );

    it(
      "suggests a future rebooking date",
      () => {
        const result =
          defaultRebookStart(
            "2026-09-21T10:00:00.000Z",
            7,
          );

        expect(
          result.toISOString(),
        ).toBe(
          "2026-09-28T10:00:00.000Z",
        );
      },
    );
  },
);
