"use client"

import {
  useEffect,
  useMemo,
  useState,
} from "react"

import {
  CheckSquare,
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from "lucide-react"

import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
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
  window_open?: boolean
  last_customer_message_at?: string | null
  hours_remaining?: number
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

interface ApprovedTemplate {
  id: string
  name: string
  language: string
  status: string
}

type WindowFilter =
  | "all"
  | "open"
  | "closed"

function formatDate(value: string | null) {
  if (!value) {
    return "—"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "—"
  }

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function localDateTime(value: string | null) {
  if (!value) {
    return ""
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const pad = (n: number) =>
    String(n).padStart(2, "0")

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
  if (status === "running") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  }

  if (
    status === "pending" ||
    status === "paused"
  ) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-300"
  }

  if (status === "completed") {
    return "border-primary/20 bg-primary/10 text-primary"
  }

  if (status === "failed") {
    return "border-red-500/20 bg-red-500/10 text-red-300"
  }

  return "border-slate-700 bg-slate-800 text-slate-400"
}

function defaultDateTime() {
  const date = new Date(
    Math.ceil(
      Date.now() / (5 * 60 * 1000),
    ) *
      (5 * 60 * 1000),
  )

  const local = new Date(
    date.getTime() -
      date.getTimezoneOffset() *
        60 *
        1000,
  )

  return local
    .toISOString()
    .slice(0, 16)
}

export default function FollowupsPage() {
  const supabase = createClient()

  const [rows, setRows] =
    useState<Enrollment[]>([])
  const [sequences, setSequences] =
    useState<Sequence[]>([])
  const [templates, setTemplates] =
    useState<ApprovedTemplate[]>([])
  const [search, setSearch] =
    useState("")
  const [statusFilter, setStatusFilter] =
    useState("all")
  const [windowFilter, setWindowFilter] =
    useState<WindowFilter>("all")
  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(
      new Set(),
    )
  const [loading, setLoading] =
    useState(true)
  const [busy, setBusy] =
    useState(false)
  const [bulkDialog, setBulkDialog] =
    useState<
      "freeform" | "template" | "schedule" | null
    >(null)
  const [messageText, setMessageText] =
    useState("")
  const [templateId, setTemplateId] =
    useState("")
  const [scheduleAt, setScheduleAt] =
    useState(defaultDateTime())

  async function load() {
    setLoading(true)

    try {
      const response =
        await fetch(
          "/api/automation-enrollments?limit=500",
          {
            cache: "no-store",
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
        (body.enrollments ??
          []) as Enrollment[],
      )

      setSequences(
        (body.sequences ??
          []) as Sequence[],
      )

      setSelectedIds(
        new Set(),
      )

      const {
        data: approved,
        error: templateError,
      } = await supabase
        .from("message_templates")
        .select(
          "id,name,language,status",
        )
        .eq(
          "status",
          "APPROVED",
        )
        .order("name")

      if (templateError) {
        throw new Error(
          templateError.message,
        )
      }

      setTemplates(
        (approved ??
          []) as ApprovedTemplate[],
      )
    } catch (error) {
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

  const filtered =
    useMemo(() => {
      const term =
        search.trim().toLowerCase()

      return rows.filter(
        (row) => {
          const matchesSearch =
            !term ||
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
              .includes(term)

          const matchesStatus =
            statusFilter ===
              "all" ||
            row.status ===
              statusFilter

          const matchesWindow =
            windowFilter ===
              "all" ||
            (windowFilter ===
              "open"
              ? row.window_open ===
                true
              : row.window_open ===
                false)

          return (
            matchesSearch &&
            matchesStatus &&
            matchesWindow
          )
        },
      )
    }, [
      rows,
      search,
      statusFilter,
      windowFilter,
    ])

  const filteredIds =
    filtered.map(
      (row) => row.id,
    )

  const selectedCount =
    selectedIds.size

  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((row) =>
      selectedIds.has(row.id),
    )

  function toggleAll() {
    setSelectedIds(
      (previous) => {
        const next =
          new Set(previous)

        if (
          filtered.every((row) =>
            next.has(row.id),
          )
        ) {
          for (const id of filteredIds) {
            next.delete(id)
          }
        } else {
          for (const id of filteredIds) {
            next.add(id)
          }
        }

        return next
      },
    )
  }

  function toggleOne(id: string) {
    setSelectedIds(
      (previous) => {
        const next =
          new Set(previous)

        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }

        return next
      },
    )
  }

  async function runBulkAction(
    action:
      | "pause"
      | "resume"
      | "cancel"
      | "reschedule",
    extra: Record<string, unknown> = {},
  ) {
    if (selectedCount === 0) {
      toast.error(
        "Select at least one follow-up lead.",
      )
      return
    }

    setBusy(true)

    try {
      const response =
        await fetch(
          "/api/automation-enrollments/bulk-action",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                enrollment_ids:
                  [...selectedIds],
                action,
                ...extra,
              }),
          },
        )

      const body =
        await response.json()

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Bulk action failed.",
        )
      }

      toast.success(
        `${body.updated ?? 0} follow-ups updated.`,
      )

      setBulkDialog(null)
      await load()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Bulk action failed.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function sendBulkFreeform() {
    if (
      selectedCount ===
        0 ||
      !messageText.trim()
    ) {
      toast.error(
        "Select leads and enter a message.",
      )
      return
    }

    setBusy(true)

    try {
      const response =
        await fetch(
          "/api/automation-enrollments/bulk-action",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                enrollment_ids:
                  [...selectedIds],
                action:
                  "freeform",
                text:
                  messageText.trim(),
              }),
          },
        )

      const body =
        await response.json()

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Bulk free-form send failed.",
        )
      }

      toast.success(
        `${body.sent ?? 0} sent, ${body.blocked ?? 0} blocked by 24h window, ${body.failed ?? 0} failed.`,
      )

      setMessageText("")
      setBulkDialog(null)
      await load()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Bulk free-form send failed.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function sendBulkTemplate() {
    if (
      selectedCount ===
        0 ||
      !templateId
    ) {
      toast.error(
        "Select leads and an approved template.",
      )
      return
    }

    const template =
      templates.find(
        (item) =>
          item.id ===
          templateId,
      )

    if (!template) {
      toast.error(
        "Approved template not found.",
      )
      return
    }

    setBusy(true)

    try {
      const response =
        await fetch(
          "/api/automation-enrollments/bulk-action",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                enrollment_ids:
                  [...selectedIds],
                action:
                  "template",
                template_name:
                  template.name,
                template_language:
                  template.language ||
                  "en_US",
              }),
          },
        )

      const body =
        await response.json()

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Bulk template send failed.",
        )
      }

      toast.success(
        `${body.sent ?? 0} template messages sent, ${body.failed ?? 0} failed.`,
      )

      setTemplateId("")
      setBulkDialog(null)
      await load()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Bulk template send failed.",
      )
    } finally {
      setBusy(false)
    }
  }

  function openBulkDialog(
    type:
      | "freeform"
      | "template"
      | "schedule",
  ) {
    if (selectedCount === 0) {
      toast.error(
        "Select at least one follow-up lead.",
      )
      return
    }

    if (type === "freeform") {
      setMessageText("")
    }

    if (type === "template") {
      setTemplateId(
        templates[0]?.id ??
          "",
      )
    }

    if (type === "schedule") {
      setScheduleAt(
        defaultDateTime(),
      )
    }

    setBulkDialog(type)
  }

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
            Manage all enrolled leads, 24-hour eligibility,
            reminders and sequence controls from one screen.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() =>
            void load()
          }
          disabled={busy}
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_170px_180px_auto]">
          <div className="relative">
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

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value,
              )
            }
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          >
            <option value="all">
              All statuses
            </option>
            <option value="pending">
              Pending
            </option>
            <option value="running">
              Running
            </option>
            <option value="paused">
              Paused
            </option>
            <option value="completed">
              Completed
            </option>
            <option value="cancelled">
              Cancelled
            </option>
            <option value="failed">
              Failed
            </option>
          </select>

          <select
            value={windowFilter}
            onChange={(event) =>
              setWindowFilter(
                event.target
                  .value as WindowFilter,
              )
            }
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          >
            <option value="all">
              All WhatsApp windows
            </option>
            <option value="open">
              24h Open — Free-form
            </option>
            <option value="closed">
              24h Closed — Template
            </option>
          </select>

          <Button
            variant="outline"
            onClick={toggleAll}
            disabled={
              filtered.length ===
              0
            }
            className="border-slate-700 text-slate-300"
          >
            <CheckSquare className="mr-2 h-4 w-4" />
            {allFilteredSelected
              ? "Deselect All"
              : "Select All"}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-950 px-3 py-1 text-slate-400">
            Showing{" "}
            <b className="text-white">
              {filtered.length}
            </b>
          </span>

          <span className="rounded-full bg-slate-950 px-3 py-1 text-primary">
            Selected{" "}
            <b>
              {selectedCount}
            </b>
          </span>

          <span className="rounded-full bg-slate-950 px-3 py-1 text-emerald-300">
            24h Open{" "}
            <b>
              {
                filtered.filter(
                  (row) =>
                    row.window_open,
                ).length
              }
            </b>
          </span>

          <span className="rounded-full bg-slate-950 px-3 py-1 text-amber-300">
            24h Closed{" "}
            <b>
              {
                filtered.filter(
                  (row) =>
                    row.window_open ===
                    false,
                ).length
              }
            </b>
          </span>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="sticky top-2 z-20 rounded-2xl border border-primary/20 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">
                {selectedCount} follow-up lead
                {selectedCount === 1
                  ? ""
                  : "s"} selected
              </p>
              <p className="text-xs text-slate-500">
                Free-form is allowed only for contacts
                whose 24-hour customer window is open.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  openBulkDialog(
                    "freeform",
                  )
                }
                disabled={busy}
                className="bg-primary text-primary-foreground"
              >
                <Send className="mr-2 h-4 w-4" />
                Free-form
              </Button>

              <Button
                variant="outline"
                onClick={() =>
                  openBulkDialog(
                    "template",
                  )
                }
                disabled={
                  busy ||
                  templates.length ===
                    0
                }
                className="border-slate-700 text-slate-300"
              >
                <Send className="mr-2 h-4 w-4" />
                Approved Template
              </Button>

              <Button
                variant="outline"
                onClick={() =>
                  openBulkDialog(
                    "schedule",
                  )
                }
                disabled={busy}
                className="border-slate-700 text-slate-300"
              >
                Schedule
              </Button>

              <Button
                variant="outline"
                onClick={() =>
                  void runBulkAction(
                    "pause",
                  )
                }
                disabled={busy}
                className="border-slate-700 text-slate-300"
              >
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>

              <Button
                variant="outline"
                onClick={() =>
                  void runBulkAction(
                    "resume",
                  )
                }
                disabled={busy}
                className="border-slate-700 text-slate-300"
              >
                <Play className="mr-2 h-4 w-4" />
                Resume
              </Button>

              <Button
                variant="ghost"
                onClick={() =>
                  void runBulkAction(
                    "cancel",
                  )
                }
                disabled={busy}
                className="text-red-400 hover:text-red-300"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

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
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        allFilteredSelected
                      }
                      onChange={toggleAll}
                      aria-label="Select all filtered follow-ups"
                    />
                  </th>

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
                    WhatsApp Window
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
                  (row) => {
                    const nextRun =
                      row.next_run_at ??
                      row.pending?.run_at ??
                      null

                    const selected =
                      selectedIds.has(
                        row.id,
                      )

                    return (
                      <tr
                        key={
                          row.id
                        }
                        className={cn(
                          "border-b border-slate-800/70 last:border-b-0",
                          selected &&
                            "bg-primary/5",
                        )}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={
                              selected
                            }
                            onChange={() =>
                              toggleOne(
                                row.id,
                              )
                            }
                            aria-label={`Select ${
                              row.contact
                                ?.name ??
                              row.contact
                                ?.phone ??
                              "lead"
                            }`}
                          />
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-medium text-white">
                            {row.contact
                              ?.name ??
                              "Unnamed lead"}
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-slate-500">
                            {row.contact
                              ?.phone ??
                              "—"}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-xs font-medium text-white">
                          {row.automation
                            ?.name ??
                            "Unknown"}
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
                          {row.window_open ? (
                            <div>
                              <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
                                Open
                              </span>
                              {typeof row.hours_remaining ===
                                "number" && (
                                <div className="mt-1 text-[10px] text-slate-500">
                                  {row.hours_remaining.toFixed(
                                    1,
                                  )}
                                  h left
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-300">
                                Closed
                              </span>
                              <div className="mt-1 text-[10px] text-slate-500">
                                Template required
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4 text-xs text-slate-300">
                          {formatDate(
                            nextRun,
                          )}
                        </td>

                        <td className="px-4 py-4 text-xs text-slate-400">
                          #
                          {(
                            row.current_step_position ??
                            0
                          ) + 1}
                        </td>

                        <td className="px-4 py-4 text-right">
                          <div className="text-[11px] text-slate-500">
                            Select lead for
                            bulk actions
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

      <Dialog
        open={
          bulkDialog !== null
        }
        onOpenChange={(open) => {
          if (!open) {
            setBulkDialog(null)
          }
        }}
      >
        <DialogContent className="border-slate-700 bg-slate-900 text-slate-100">
          {bulkDialog ===
            "freeform" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Bulk Free-form Reminder
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  Only contacts whose WhatsApp 24-hour
                  customer window is open will receive this
                  message.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">
                  <b>
                    {filtered.filter(
                      (row) =>
                        selectedIds.has(
                          row.id,
                        ) &&
                        row.window_open,
                    ).length}
                  </b>{" "}
                  selected leads currently have an open
                  24-hour window.
                </div>

                <textarea
                  value={messageText}
                  onChange={(event) =>
                    setMessageText(
                      event.target
                        .value,
                    )
                  }
                  rows={6}
                  placeholder="Hi {{name}} 😊 Just checking in..."
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white placeholder-slate-500"
                />

                <p className="text-[11px] text-slate-500">
                  Use <code>{"{{name}}"}</code> for contact-name
                  personalization.
                </p>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    setBulkDialog(null)
                  }
                  className="border-slate-700 text-slate-300"
                >
                  Cancel
                </Button>

                <Button
                  disabled={
                    busy ||
                    !messageText.trim()
                  }
                  onClick={() =>
                    void sendBulkFreeform()
                  }
                  className="bg-primary text-primary-foreground"
                >
                  {busy && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Send Free-form
                </Button>
              </DialogFooter>
            </>
          )}

          {bulkDialog ===
            "template" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Bulk Approved Template
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  This can be used for leads whose 24-hour window
                  is closed.
                </DialogDescription>
              </DialogHeader>

              <select
                value={templateId}
                onChange={(event) =>
                  setTemplateId(
                    event.target.value,
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
              >
                <option value="">
                  Select approved template
                </option>

                {templates.map(
                  (template) => (
                    <option
                      key={
                        template.id
                      }
                      value={
                        template.id
                      }
                    >
                      {template.name} —{" "}
                      {template.language}
                    </option>
                  ),
                )}
              </select>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    setBulkDialog(null)
                  }
                  className="border-slate-700 text-slate-300"
                >
                  Cancel
                </Button>

                <Button
                  disabled={
                    busy ||
                    !templateId
                  }
                  onClick={() =>
                    void sendBulkTemplate()
                  }
                >
                  {busy && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Send Template
                </Button>
              </DialogFooter>
            </>
          )}

          {bulkDialog ===
            "schedule" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Reschedule Selected Follow-ups
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  This changes the next scheduled sequence checkpoint
                  for the selected enrolled leads.
                </DialogDescription>
              </DialogHeader>

              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(event) =>
                  setScheduleAt(
                    event.target
                      .value,
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"
              />

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    setBulkDialog(null)
                  }
                  className="border-slate-700 text-slate-300"
                >
                  Cancel
                </Button>

                <Button
                  disabled={
                    busy ||
                    !scheduleAt
                  }
                  onClick={() =>
                    void runBulkAction(
                      "reschedule",
                      {
                        run_at:
                          new Date(
                            scheduleAt,
                          ).toISOString(),
                      },
                    )
                  }
                >
                  {busy && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Schedule Selected
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
