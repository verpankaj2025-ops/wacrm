import { describe, expect, it } from "vitest";
import {
  isWithinCustomerServiceWindow,
  WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS,
} from "./customer-window";

describe("WhatsApp customer service window", () => {
  const now =
    Date.parse("2026-09-21T12:00:00.000Z");

  it("accepts a recent customer message", () => {
    expect(
      isWithinCustomerServiceWindow(
        new Date(
          now - 60 * 60 * 1000,
        ).toISOString(),
        now,
      ),
    ).toBe(true);
  });

  it("rejects the 24-hour boundary", () => {
    expect(
      isWithinCustomerServiceWindow(
        new Date(
          now -
            WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS,
        ).toISOString(),
        now,
      ),
    ).toBe(false);
  });

  it("rejects invalid timestamps", () => {
    expect(
      isWithinCustomerServiceWindow(
        "invalid",
        now,
      ),
    ).toBe(false);
  });
});
