"use client"

import {
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react"

import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Enrollment {
  id: string
  status:
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed"
  automation_id: string
  contact_id: string
  next_run_at: string | null
  current_step_position: number
  contact: {
    name: string | null
    phone: string
  } | null
  automation: {
    id: string
    name: string
    is_active: boolean
  } | null
  pending: {
    run_at: string
  } | null
}

interface Sequence {
  id: string
  name: string
  is_active: boolean
}

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "—"
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—"
  }

  return date.toLocaleString(
    undefined,
    {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    },
  )
}

function localDateTime(
  value: string | null,
) {
  if (!value) {
    return ""
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return ""
  }

  const pad =
    (n: number) =>
      String(n).padStart(
        2,
        "0",
      )

  return `${date.getFullYear()}-${pad(
    date.getMonth() + 1,
  )}-${pad(
    date.getDate(),
  )}T${pad(
    date.getHours(),
  )}:${pad(
    date.getMinutes(),
  )}`
}

function statusClass(
  status: Enrollment["status"],
) {
  if (
    status === "running"
  ) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  }

  if (
    status === "pending" ||
    status === "paused"
  ) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-300"
  }

  if (
    status === "completed"
  ) {
    return "border-primary/20 bg-primary/10 text-primary"
  }

  if (
    status === "failed"
  ) {
    return "border-red-500/20 bg-red-500/10 text-red-300"
  }

  return "border-slate-700 bg-slate-800 text-slate-400"
}

export default function FollowupsPage() {
  const [
    rows,
    setRows,
  ] = useState<Enrollment[]>([])

  const [
    sequences,
    setSequences,
  ] = useState<Sequence[]>([])

  const [
    search,
    setSearch,
  ] = useState("")

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    busyId,
    setBusyId,
  ] = useState<string | null>(null)

  const [
    editingTime,
    setEditingTime,
  ] = useState<string | null>(null)

  const [
    timeDraft,
    setTimeDraft,
  ] = useState("")

  const [
    editingSequence,
    setEditingSequence,
  ] = useState<string | null>(null)

  const [
    sequenceDraft,
    setSequenceDraft,
  ] = useState("")

  async function load() {
    setLoading(true)

    try {
      const response =
        await fetch(
          "/api/automation-enrollments?limit=500",
          {
            cache:
              "no-store",
          },
        )

      const body =
        await response.json()

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Failed to load follow-ups",
        )
      }

      setRows(
        body.enrollments ??
          [],
      )

      setSequences(
        body.sequences ??
          [],
      )
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load follow-ups",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function action(
    row: Enrollment,
    actionName:
      | "pause"
      | "resume"
      | "cancel"
      | "reschedule"
      | "change_sequence",
    extra: Record<string, unknown> = {},
  ) {
    setBusyId(row.id)

    try {
      const response =
        await fetch(
          "/api/automation-enrollments",
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                enrollment_id:
                  row.id,
                action:
                  actionName,
                ...extra,
              }),
          },
        )

      const body =
        await response.json()

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Follow-up action failed",
        )
      }

      toast.success(
        "Follow-up updated",
      )

      setEditingTime(null)
      setEditingSequence(null)

      await load()
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Follow-up action failed",
      )
    } finally {
      setBusyId(null)
    }
  }

  const filtered =
    useMemo(
      () => {
        const term =
          search
            .trim()
            .toLowerCase()

        if (!term) {
          return rows
        }

        return rows.filter(
          (
            row,
          ) =>
            (
              row.contact?.name ??
              ""
            )
              .toLowerCase()
              .includes(term) ||
            (
              row.contact?.phone ??
              ""
            )
              .toLowerCase()
              .includes(term) ||
            (
              row.automation?.name ??
              ""
            )
              .toLowerCase()
              .includes(term),
        )
      },
      [
        rows,
        search,
      ],
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-white">
              Follow-up Leads
            </h1>
          </div>

          <p className="mt-1 text-sm text-slate-400">
            Manage the next follow-up time,
            sequence and state for each lead.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() =>
            void load()
          }
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

          <Input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="Search lead, phone or sequence..."
            className="border-slate-700 bg-slate-950 pl-9 text-white"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <Clock className="h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm font-semibold text-white">
              No follow-up leads
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Import a lead and enroll it in a sequence first.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">
                    Lead
                  </th>
                  <th className="px-4 py-3">
                    Sequence
                  </th>
                  <th className="px-4 py-3">
                    Status
                  </th>
                  <th className="px-4 py-3">
                    Next Follow-up
                  </th>
                  <th className="px-4 py-3">
                    Step
                  </th>
                  <th className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(
                  (
                    row,
                  ) => {
                    const nextRun =
                      row.next_run_at ??
                      row.pending?.run_at ??
                      null

                    const busy =
                      busyId ===
                      row.id

                    return (
                      <tr
                        key={
                          row.id
                        }
                        className="border-b border-slate-800/70 last:border-b-0"
                      >
                        <td className="px-4 py-4">
                          <div className="font-medium text-white">
                            {row.contact?.name ??
                              "Unnamed lead"}
                          </div>

                          <div className="mt-1 font-mono text-[11px] text-slate-500">
                            {row.contact?.phone ??
                              "—"}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          {editingSequence ===
                          row.id ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={
                                  sequenceDraft
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setSequenceDraft(
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                className="w-48 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                              >
                                {sequences
                                  .filter(
                                    (
                                      sequence,
                                    ) =>
                                      sequence.is_active,
                                  )
                                  .map(
                                    (
                                      sequence,
                                    ) => (
                                      <option
                                        key={
                                          sequence.id
                                        }
                                        value={
                                          sequence.id
                                        }
                                      >
                                        {
                                          sequence.name
                                        }
                                      </option>
                                    ),
                                  )}
                              </select>

                              <Button
                                size="sm"
                                disabled={
                                  busy
                                }
                                onClick={() =>
                                  void action(
                                    row,
                                    "change_sequence",
                                    {
                                      automation_id:
                                        sequenceDraft,
                                    },
                                  )
                                }
                              >
                                Save
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSequence(
                                  row.id,
                                )
                                setSequenceDraft(
                                  row.automation_id,
                                )
                              }}
                              className="text-left text-xs font-medium text-white hover:text-primary"
                            >
                              {row.automation?.name ??
                                "Unknown"}
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium",
                              statusClass(
                                row.status,
                              ),
                            )}
                          >
                            {row.status}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          {editingTime ===
                          row.id ? (
                            <div className="space-y-2">
                              <input
                                type="datetime-local"
                                value={
                                  timeDraft
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setTimeDraft(
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                className="w-56 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"
                              />

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  disabled={
                                    busy ||
                                    !timeDraft
                                  }
                                  onClick={() =>
                                    void action(
                                      row,
                                      "reschedule",
                                      {
                                        run_at:
                                          new Date(
                                            timeDraft,
                                          ).toISOString(),
                                      },
                                    )
                                  }
                                >
                                  Save
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setEditingTime(
                                      null,
                                    )
                                  }
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTime(
                                  row.id,
                                )

                                setTimeDraft(
                                  localDateTime(
                                    nextRun,
                                  ),
                                )
                              }}
                              className="text-left text-xs text-slate-300 hover:text-primary"
                            >
                              {formatDate(
                                nextRun,
                              )}
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-4 text-xs text-slate-400">
                          #
                          {(
                            row.current_step_position ??
                            0
                          ) + 1}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            {row.status ===
                            "paused" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  busy
                                }
                                onClick={() =>
                                  void action(
                                    row,
                                    "resume",
                                  )
                                }
                                className="border-slate-700 text-slate-300"
                              >
                                <Play className="mr-1 h-3.5 w-3.5" />
                                Resume
                              </Button>
                            ) : (
                              (
                                row.status ===
                                  "pending" ||
                                row.status ===
                                  "running"
                              ) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    busy
                                  }
                                  onClick={() =>
                                    void action(
                                      row,
                                      "pause",
                                    )
                                  }
                                  className="border-slate-700 text-slate-300"
                                >
                                  <Pause className="mr-1 h-3.5 w-3.5" />
                                  Pause
                                </Button>
                              )
                            )}

                            {(
                              row.status ===
                                "pending" ||
                              row.status ===
                                "paused" ||
                              row.status ===
                                "running"
                            ) && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={
                                    busy
                                  }
                                  onClick={() =>
                                    void action(
                                      row,
                                      "reschedule",
                                      {
                                        run_at:
                                          new Date(
                                            Date.now() +
                                              30 *
                                                60 *
                                                1000,
                                          ).toISOString(),
                                      },
                                    )
                                  }
                                  className="text-slate-400 hover:text-white"
                                >
                                  +30m
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={
                                    busy
                                  }
                                  onClick={() =>
                                    void action(
                                      row,
                                      "cancel",
                                    )
                                  }
                                  className="text-red-400 hover:text-red-300"
                                >
                                  <XCircle className="mr-1 h-3.5 w-3.5" />
                                  Cancel
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
