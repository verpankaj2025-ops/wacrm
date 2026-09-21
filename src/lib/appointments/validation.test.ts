import {
  describe,
  expect,
  it,
} from "vitest";

function isValidRange(
  start: string,
  end: string,
) {
  const startMs =
    new Date(start).getTime();
  const endMs =
    new Date(end).getTime();

  return (
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    endMs > startMs
  );
}

describe("appointment time validation", () => {
  it("accepts a valid appointment range", () => {
    expect(
      isValidRange(
        "2026-09-21T10:00:00.000Z",
        "2026-09-21T11:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("rejects equal start and end", () => {
    expect(
      isValidRange(
        "2026-09-21T10:00:00.000Z",
        "2026-09-21T10:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("rejects end before start", () => {
    expect(
      isValidRange(
        "2026-09-21T11:00:00.000Z",
        "2026-09-21T10:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(
      isValidRange(
        "invalid",
        "2026-09-21T10:00:00.000Z",
      ),
    ).toBe(false);
  });
});
