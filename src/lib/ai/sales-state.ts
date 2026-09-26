export type SalesStage =
  | "service"
  | "date"
  | "time"
  | "name"
  | "confirmation"
  | "booked"
  | "handoff"

export interface SalesState {
  stage: SalesStage
  service?: string | null
  date?: string | null
  time?: string | null
  customerName?: string | null
  bookingConfirmed: boolean
}

export type SalesField =
  | "service"
  | "date"
  | "time"
  | "name"
  | "confirmation"

export function isSalesStage(
  value?: string | null,
): value is SalesStage {
  return (
    value === "service" ||
    value === "date" ||
    value === "time" ||
    value === "name" ||
    value === "confirmation" ||
    value === "booked" ||
    value === "handoff"
  )
}

export function getMissingSalesField(
  state: SalesState,
): SalesField | null {
  if (!state.service?.trim()) {
    return "service"
  }

  if (!state.date?.trim()) {
    return "date"
  }

  if (!state.time?.trim()) {
    return "time"
  }

  if (!state.customerName?.trim()) {
    return "name"
  }

  if (!state.bookingConfirmed) {
    return "confirmation"
  }

  return null
}

export function deriveSalesStage(
  state: SalesState,
): SalesStage {
  if (
    state.bookingConfirmed &&
    state.service?.trim() &&
    state.date?.trim() &&
    state.time?.trim()
  ) {
    return "booked"
  }

  const missing =
    getMissingSalesField(state)

  switch (missing) {
    case "service":
      return "service"

    case "date":
      return "date"

    case "time":
      return "time"

    case "name":
      return "name"

    case "confirmation":
      return "confirmation"

    default:
      return "confirmation"
  }
}

export function getNextSalesQuestion(
  state: SalesState,
): string | null {
  switch (deriveSalesStage(state)) {
    case "service":
      return "Aap kis service ke liye booking karna chahenge?"

    case "date":
      return "Kis date par visit karna chahenge?"

    case "time":
      return "Kis time par appointment chahiye?"

    case "name":
      return "Booking kis naam se karni hai?"

    case "confirmation":
      return "Kya main aapki booking request confirm kar doon?"

    case "booked":
      return null

    case "handoff":
      return null

    default:
      return null
  }
}

export function buildSalesContext(
  state: SalesState,
): string {
  const stage =
    deriveSalesStage(state)

  return [
    `Sales stage: ${stage}`,
    `Selected service: ${
      state.service || "not selected"
    }`,
    `Requested date: ${
      state.date || "not selected"
    }`,
    `Requested time: ${
      state.time || "not selected"
    }`,
    `Customer name: ${
      state.customerName || "not confirmed"
    }`,
    `Booking confirmed: ${
      state.bookingConfirmed
        ? "yes"
        : "no"
    }`,
    `Next required field: ${
      getMissingSalesField(state) ||
      "none"
    }`,
  ].join("\n")
}
