
export const REBOOKABLE_STATUSES = [
  "completed",
  "no_show",
] as const;

export type RebookableAppointmentStatus =
  (typeof REBOOKABLE_STATUSES)[number];

export function canRebookAppointment(
  status: string,
): status is RebookableAppointmentStatus {
  return (
    status === "completed" ||
    status === "no_show"
  );
}

export function defaultRebookStart(
  startAt: string,
  days = 7,
) {
  const original = new Date(startAt);

  if (Number.isNaN(original.getTime())) {
    throw new Error(
      "Invalid original appointment time.",
    );
  }

  return new Date(
    original.getTime() +
      days *
        24 *
        60 *
        60 *
        1000,
  );
}

export function appointmentDurationMs(
  startAt: string,
  endAt: string,
) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    end <= start
  ) {
    throw new Error(
      "Invalid appointment duration.",
    );
  }

  return end - start;
}
