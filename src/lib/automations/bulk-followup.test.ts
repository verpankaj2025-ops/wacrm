import {
  describe,
  expect,
  it,
} from "vitest"

function filterRows(
  rows: Array<{
    id: string
    status: string
    window_open: boolean
    name: string
  }>,
  status: string,
  window: "all" | "open" | "closed",
) {
  return rows.filter(
    (row) =>
      (status === "all" ||
        row.status === status) &&
      (window === "all" ||
        (window === "open"
          ? row.window_open
          : !row.window_open)),
  )
}

describe("bulk follow-up filtering", () => {
  const rows = [
    {
      id: "1",
      status: "running",
      window_open: true,
      name: "Open lead",
    },
    {
      id: "2",
      status: "pending",
      window_open: false,
      name: "Closed lead",
    },
    {
      id: "3",
      status: "paused",
      window_open: true,
      name: "Paused open lead",
    },
  ]

  it("filters 24h-open leads", () => {
    expect(
      filterRows(
        rows,
        "all",
        "open",
      ).map((row) => row.id),
    ).toEqual(["1", "3"])
  })

  it("filters 24h-closed leads", () => {
    expect(
      filterRows(
        rows,
        "all",
        "closed",
      ).map((row) => row.id),
    ).toEqual(["2"])
  })

  it("combines status and window filters", () => {
    expect(
      filterRows(
        rows,
        "paused",
        "open",
      ).map((row) => row.id),
    ).toEqual(["3"])
  })
})
