import {
  describe,
  expect,
  it,
} from "vitest";

function mapAction(
  mode:
    | "sequence"
    | "freeform"
    | "template",
) {
  if (mode === "sequence") {
    return "start_sequence";
  }

  if (mode === "freeform") {
    return "freeform";
  }

  return "template";
}

describe(
  "contacts master bulk actions",
  () => {
    it("maps follow-up correctly", () => {
      expect(
        mapAction("sequence"),
      ).toBe("start_sequence");
    });

    it("maps free-form correctly", () => {
      expect(
        mapAction("freeform"),
      ).toBe("freeform");
    });

    it("maps reminder correctly", () => {
      expect(
        mapAction("template"),
      ).toBe("template");
    });
  },
);
