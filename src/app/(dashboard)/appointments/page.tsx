"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  RotateCcw,
  XCircle,
} from "lucide-react";

import {
  canRebookAppointment,
  defaultRebookStart,
  appointmentDurationMs,
} from "@/lib/appointments/rebooking";

type ContactOption = {
  id: string;
  name: string | null;
  phone: string;
  email?: string | null;
};

type Appointment = {
  id: string;
  contact_id: string;
  assigned_to: string | null;
  service_name: string;
  start_at: string;
  end_at: string;
  status:
    | "scheduled"
    | "confirmed"
    | "completed"
    | "cancelled"
    | "no_show";
  notes: string | null;
  rebooked_from_id?: string | null;
  contact?: ContactOption | null;
  assignee?: {
    user_id: string;
    full_name: string;
  } | null;
};

const STATUS_META = {
  scheduled: {
    label: "Scheduled",
    className:
      "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  confirmed: {
    label: "Confirmed",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  completed: {
    label: "Completed",
    className:
      "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "border-red-500/30 bg-red-500/10 text-red-300",
  },
  no_show: {
    label: "No Show",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
} as const;

function localDateTime(iso: string) {
  const d = new Date(iso);

  const pad = (value: number) =>
    String(value).padStart(2, "0");

  return {
    date: `${d.getFullYear()}-${pad(
      d.getMonth() + 1,
    )}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(
      d.getMinutes(),
    )}`,
  };
}

function toIso(date: string, time: string) {
  return new Date(
    `${date}T${time}`,
  ).toISOString();
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(iso));
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] =
    useState<Appointment[]>([]);
  const [contacts, setContacts] =
    useState<ContactOption[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [rebookingFromId, setRebookingFromId] =
    useState<string | null>(null);

  const [contactId, setContactId] =
    useState("");
  const [serviceName, setServiceName] =
    useState("");
  const [date, setDate] =
    useState("");
  const [time, setTime] =
    useState("");
  const [endTime, setEndTime] =
    useState("");
  const [status, setStatus] =
    useState<Appointment["status"]>(
      "scheduled",
    );
  const [notes, setNotes] =
    useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/appointments?include_contacts=true",
          {
            cache: "no-store",
          },
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            "Unable to load appointments.",
        );
      }

      setAppointments(
        (payload.appointments ??
          []) as Appointment[],
      );

      setContacts(
        (payload.contacts ??
          []) as ContactOption[],
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load appointments.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setRebookingFromId(null);
    setContactId("");
    setServiceName("");
    setDate("");
    setTime("");
    setEndTime("");
    setStatus("scheduled");
    setNotes("");
  }

  function startRebook(
    appointment: Appointment,
  ) {
    if (
      !canRebookAppointment(
        appointment.status,
      )
    ) {
      setError(
        "Only completed or no-show appointments can be rebooked.",
      );
      return;
    }

    try {
      const start =
        defaultRebookStart(
          appointment.start_at,
          7,
        );

      const duration =
        appointmentDurationMs(
          appointment.start_at,
          appointment.end_at,
        );

      const end =
        new Date(
          start.getTime() +
            duration,
        );

      const pad = (
        value: number,
      ) =>
        String(value).padStart(
          2,
          "0",
        );

      setEditingId(null);
      setRebookingFromId(
        appointment.id,
      );

      setContactId(
        appointment.contact_id,
      );

      setServiceName(
        appointment.service_name,
      );

      setDate(
        `${start.getFullYear()}-${pad(
          start.getMonth() + 1,
        )}-${pad(
          start.getDate(),
        )}`,
      );

      setTime(
        `${pad(
          start.getHours(),
        )}:${pad(
          start.getMinutes(),
        )}`,
      );

      setEndTime(
        `${pad(
          end.getHours(),
        )}:${pad(
          end.getMinutes(),
        )}`,
      );

      setStatus("scheduled");

      setNotes(
        appointment.notes
          ? `Rebooking from previous visit. ${appointment.notes}`
          : "Rebooking from previous visit.",
      );

      setError(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to prepare rebooking.",
      );
    }
  }

  function startEdit(
    appointment: Appointment,
  ) {
    const start =
      localDateTime(
        appointment.start_at,
      );
    const end =
      localDateTime(
        appointment.end_at,
      );

    setEditingId(appointment.id);
    setContactId(
      appointment.contact_id,
    );
    setServiceName(
      appointment.service_name,
    );
    setDate(start.date);
    setTime(start.time);
    setEndTime(end.time);
    setStatus(appointment.status);
    setNotes(
      appointment.notes ?? "",
    );
  }

  async function saveAppointment() {
    if (
      !contactId ||
      !serviceName.trim() ||
      !date ||
      !time ||
      !endTime
    ) {
      setError(
        "Contact, service, date, start time and end time are required.",
      );
      return;
    }

    const startAt =
      toIso(date, time);
    const endAt =
      toIso(date, endTime);

    if (
      new Date(endAt).getTime() <=
      new Date(startAt).getTime()
    ) {
      setError(
        "End time must be after start time.",
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = rebookingFromId
        ? `/api/appointments/${rebookingFromId}/rebook`
        : editingId
          ? `/api/appointments/${editingId}`
          : "/api/appointments";

      const method = "POST";

      const response =
        await fetch(url, {
          method,
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            rebookingFromId
              ? {
                  start_at: startAt,
                  end_at: endAt,
                  service_name:
                    serviceName.trim(),
                  notes:
                    notes.trim() ||
                    null,
                }
              : {
                  contact_id:
                    contactId,
                  service_name:
                    serviceName.trim(),
                  start_at:
                    startAt,
                  end_at:
                    endAt,
                  status,
                  notes:
                    notes.trim() ||
                    null,
                },
          ),
        });

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            "Unable to save appointment.",
        );
      }

      resetForm();
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save appointment.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(
    id: string,
    nextStatus: Appointment["status"],
  ) {
    setSaving(true);
    setError(null);

    try {
      const response =
        await fetch(
          `/api/appointments/${id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              status: nextStatus,
            }),
          },
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            "Unable to update appointment.",
        );
      }

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update appointment.",
      );
    } finally {
      setSaving(false);
    }
  }

  const upcoming = useMemo(() => {
    const now = Date.now();

    return appointments.filter(
      (appointment) =>
        new Date(
          appointment.end_at,
        ).getTime() >= now &&
        appointment.status !==
          "cancelled",
    );
  }, [appointments]);

  const history = useMemo(() => {
    const upcomingIds =
      new Set(
        upcoming.map(
          (item) => item.id,
        ),
      );

    return appointments.filter(
      (appointment) =>
        !upcomingIds.has(
          appointment.id,
        ),
    );
  }, [appointments, upcoming]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" />
            <h1 className="text-xl font-semibold text-white">
              Appointments
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Book, reschedule and manage spa appointments.
          </p>
        </div>

        <button
          type="button"
          onClick={resetForm}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="size-4" />
          New Appointment
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-white">
            {rebookingFromId
              ? "Rebook Appointment"
              : editingId
                ? "Edit Appointment"
                : "Book Appointment"}
          </h2>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">
                Contact
              </span>
              <select
                value={contactId}
                onChange={(e) =>
                  setContactId(
                    e.target.value,
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"
              >
                <option value="">
                  Select contact
                </option>
                {contacts.map(
                  (contact) => (
                    <option
                      key={contact.id}
                      value={contact.id}
                    >
                      {contact.name ||
                        contact.phone}{" "}
                      —{" "}
                      {
                        contact.phone
                      }
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">
                Service
              </span>
              <input
                value={serviceName}
                onChange={(e) =>
                  setServiceName(
                    e.target.value,
                  )
                }
                placeholder="Thai Massage / Couples Spa / etc."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">
                  Date
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) =>
                    setDate(
                      e.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">
                  Start
                </span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) =>
                    setTime(
                      e.target.value,
                    )
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">
                End
              </span>
              <input
                type="time"
                value={endTime}
                onChange={(e) =>
                  setEndTime(
                    e.target.value,
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">
                Status
              </span>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(
                    e.target
                      .value as Appointment["status"],
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"
              >
                {Object.entries(
                  STATUS_META,
                ).map(
                  ([
                    value,
                    meta,
                  ]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {meta.label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(e) =>
                  setNotes(
                    e.target.value,
                  )
                }
                rows={4}
                placeholder="Therapist preference, package, special request..."
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-slate-500"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  void saveAppointment()
                }
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {editingId
                  ? "Save Changes"
                  : "Book Appointment"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Upcoming
                </h2>
                <p className="text-xs text-slate-500">
                  {upcoming.length} appointments
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void load()
                }
                className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Refresh appointments"
              >
                <RotateCcw className="size-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-slate-500" />
              </div>
            ) : upcoming.length ===
              0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-500">
                No upcoming appointments.
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {upcoming.map(
                  (appointment) => {
                    const meta =
                      STATUS_META[
                        appointment.status
                      ];

                    return (
                      <div
                        key={
                          appointment.id
                        }
                        className="p-5"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-white">
                                {appointment.contact
                                  ?.name ??
                                  appointment
                                    .contact
                                    ?.phone ??
                                  "Unknown contact"}
                              </span>

                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}
                              >
                                {
                                  meta.label
                                }
                              </span>
                            </div>

                            <p className="mt-1 text-xs text-primary">
                              {
                                appointment.service_name
                              }
                            </p>

                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock3 className="size-3.5" />
                                {
                                  formatDateTime(
                                    appointment.start_at,
                                  )
                                }
                                {" → "}
                                {new Intl.DateTimeFormat(
                                  "en-IN",
                                  {
                                    timeStyle:
                                      "short",
                                  },
                                ).format(
                                  new Date(
                                    appointment.end_at,
                                  ),
                                )}
                              </span>

                              {appointment.assignee && (
                                <span>
                                  Staff:{" "}
                                  {
                                    appointment
                                      .assignee
                                      .full_name
                                  }
                                </span>
                              )}
                            </div>

                            {appointment.notes && (
                              <p className="mt-3 text-xs leading-5 text-slate-500">
                                {
                                  appointment.notes
                                }
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                startEdit(
                                  appointment,
                                )
                              }
                              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              Reschedule
                            </button>

                            {appointment.status ===
                              "scheduled" && (
                              <button
                                type="button"
                                onClick={() =>
                                  void updateStatus(
                                    appointment.id,
                                    "confirmed",
                                  )
                                }
                                className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10"
                              >
                                Confirm
                              </button>
                            )}

                            {appointment.status ===
                              "confirmed" && (
                              <button
                                type="button"
                                onClick={() =>
                                  void updateStatus(
                                    appointment.id,
                                    "completed",
                                  )
                                }
                                className="rounded-lg border border-violet-500/30 px-3 py-2 text-xs text-violet-300 hover:bg-violet-500/10"
                              >
                                Complete
                              </button>
                            )}

                            {(appointment.status ===
                              "scheduled" ||
                              appointment.status ===
                                "confirmed") && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateStatus(
                                      appointment.id,
                                      "no_show",
                                    )
                                  }
                                  className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10"
                                >
                                  No Show
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void updateStatus(
                                      appointment.id,
                                      "cancelled",
                                    )
                                  }
                                  className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                History
              </h2>
            </div>

            {history.length ===
            0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                No appointment history yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {history.map(
                  (appointment) => (
                    <div
                      key={
                        appointment.id
                      }
                      className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">
                          {appointment.contact
                            ?.name ??
                            appointment
                              .contact
                              ?.phone ??
                            "Unknown contact"}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {
                            appointment.service_name
                          }{" "}
                          ·{" "}
                          {formatDateTime(
                            appointment.start_at,
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_META[appointment.status].className}`}
                        >
                          {
                            STATUS_META[
                              appointment
                                .status
                            ].label
                          }
                        </span>

                        {canRebookAppointment(
                          appointment.status,
                        ) && (
                          <button
                            type="button"
                            onClick={() =>
                              startRebook(
                                appointment,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                          >
                            <RotateCcw className="size-3" />
                            Rebook
                          </button>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs text-slate-500">
        Appointment times use your browser's local timezone. Later
        Completed and no-show visits can now be rebooked directly
        from history. Rebooking keeps the original appointment linked
        to the new visit.
      </div>
    </div>
  );
}
