"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Loader2,
  PlayCircle,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import type { Contact } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Mode =
  | "sequence"
  | "freeform"
  | "template";

type Sequence = {
  id: string;
  name: string;
  is_active: boolean;
};

type ApprovedTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
};

function localDateTimeInput() {
  const date = new Date(
    Math.ceil(
      Date.now() /
        (5 * 60 * 1000),
    ) *
      (5 * 60 * 1000),
  );

  const local = new Date(
    date.getTime() -
      date.getTimezoneOffset() *
        60 *
        1000,
  );

  return local
    .toISOString()
    .slice(0, 16);
}

export function BulkContactActionsDialog({
  open,
  contacts,
  onOpenChange,
  onCompleted,
  initialMode = "sequence",
}: {
  open: boolean;
  contacts: Contact[];
  onOpenChange: (
    open: boolean,
  ) => void;
  onCompleted?: (
    mode: Mode,
  ) => void;
  initialMode?: Mode;
}) {
  const supabase =
    createClient();

  const [mode, setMode] =
    useState<Mode>(
      initialMode,
    );

  const [sequences, setSequences] =
    useState<Sequence[]>(
      [],
    );

  const [templates, setTemplates] =
    useState<ApprovedTemplate[]>(
      [],
    );

  const [sequenceId, setSequenceId] =
    useState("");

  const [templateId, setTemplateId] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [startAt, setStartAt] =
    useState(
      localDateTimeInput(),
    );

  const [consentConfirmed, setConsentConfirmed] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    if (!open) return;

    setMode(initialMode);
    setMessage("");
    setStartAt(
      localDateTimeInput(),
    );
    setConsentConfirmed(false);

    void (async () => {
      try {
        const [
          automationResponse,
          templatesResult,
        ] = await Promise.all([
          fetch(
            "/api/automations",
            {
              cache: "no-store",
            },
          ),
          supabase
            .from(
              "message_templates",
            )
            .select(
              "id,name,language,status",
            )
            .eq(
              "status",
              "APPROVED",
            )
            .order("name"),
        ]);

        const automationPayload =
          await automationResponse.json();

        if (
          !automationResponse.ok
        ) {
          throw new Error(
            automationPayload?.error ??
              "Unable to load follow-up sequences.",
          );
        }

        const activeSequences =
          (
            automationPayload?.automations ??
            []
          ).filter(
            (
              item: Sequence,
            ) => item.is_active,
          ) as Sequence[];

        setSequences(
          activeSequences,
        );

        setSequenceId(
          activeSequences[0]?.id ??
            "",
        );

        if (
          templatesResult.error
        ) {
          throw new Error(
            templatesResult.error.message,
          );
        }

        const approved =
          (templatesResult.data ??
            []) as ApprovedTemplate[];

        setTemplates(
          approved,
        );

        setTemplateId(
          approved[0]?.id ??
            "",
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load bulk action options.",
        );
      }
    })();
  }, [
    open,
    initialMode,
    supabase,
  ]);

  async function submit() {
    if (!contacts.length) {
      toast.error(
        "No contacts selected.",
      );
      return;
    }

    if (
      mode === "sequence" &&
      !sequenceId
    ) {
      toast.error(
        "Select a follow-up sequence.",
      );
      return;
    }

    if (
      mode === "sequence" &&
      !consentConfirmed
    ) {
      toast.error(
        "Confirm WhatsApp opt-in before starting the sequence.",
      );
      return;
    }

    if (
      mode === "freeform" &&
      !message.trim()
    ) {
      toast.error(
        "Enter the free-form message.",
      );
      return;
    }

    if (
      mode === "template" &&
      !templateId
    ) {
      toast.error(
        "Select an approved template.",
      );
      return;
    }

    const template =
      templates.find(
        (item) =>
          item.id ===
          templateId,
      );

    setLoading(true);

    try {
      const response =
        await fetch(
          "/api/contacts/bulk-actions",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              contact_ids:
                contacts.map(
                  (contact) =>
                    contact.id,
                ),
              action:
                mode ===
                "sequence"
                  ? "start_sequence"
                  : mode ===
                    "freeform"
                    ? "freeform"
                    : "template",
              automation_id:
                mode ===
                "sequence"
                  ? sequenceId
                  : undefined,
              start_at:
                mode ===
                "sequence"
                  ? new Date(
                      startAt,
                    ).toISOString()
                  : undefined,
              consent_confirmed:
                mode ===
                "sequence"
                  ? true
                  : undefined,
              text:
                mode ===
                "freeform"
                  ? message.trim()
                  : undefined,
              template_name:
                mode ===
                "template"
                  ? template?.name
                  : undefined,
              template_language:
                mode ===
                "template"
                  ? template?.language ??
                    "en_US"
                  : undefined,
            }),
          },
        );

      const payload =
        await response
          .json()
          .catch(
            () => ({}),
          );

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            "Bulk contact action failed.",
        );
      }

      if (
        mode === "sequence"
      ) {
        toast.success(
          `${payload.started ?? 0} follow-ups started. ${payload.skipped ?? 0} skipped, ${payload.failed ?? 0} failed.`,
        );
      }

      if (
        mode === "freeform"
      ) {
        toast.success(
          `${payload.sent ?? 0} free-form messages sent. ${payload.blocked ?? 0} blocked by the 24-hour window, ${payload.failed ?? 0} failed.`,
        );
      }

      if (
        mode === "template"
      ) {
        toast.success(
          `${payload.sent ?? 0} reminder templates sent. ${payload.failed ?? 0} failed.`,
        );
      }

      onOpenChange(false);
      onCompleted?.(
        mode,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Bulk contact action failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={
        onOpenChange
      }
    >
      <DialogContent className="border-slate-700 bg-slate-900 text-slate-100 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Bulk Contact Action
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {contacts.length} contacts selected. The CRM enforces the WhatsApp 24-hour rule on the server.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={
              mode ===
              "sequence"
                ? "default"
                : "outline"
            }
            onClick={() =>
              setMode(
                "sequence",
              )
            }
          >
            <PlayCircle className="mr-2 size-4" />
            Follow-up
          </Button>

          <Button
            size="sm"
            variant={
              mode ===
              "freeform"
                ? "default"
                : "outline"
            }
            onClick={() =>
              setMode(
                "freeform",
              )
            }
          >
            <Send className="mr-2 size-4" />
            Free-form
          </Button>

          <Button
            size="sm"
            variant={
              mode ===
              "template"
                ? "default"
                : "outline"
            }
            onClick={() =>
              setMode(
                "template",
              )
            }
          >
            <Bell className="mr-2 size-4" />
            Reminder
          </Button>
        </div>

        {mode ===
          "sequence" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-5 text-slate-300">
              Cold leads outside 24h must start with an approved WhatsApp template step. After a customer reply, later Send Message steps can use free-form text.
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">
                Follow-up sequence
              </span>

              <select
                value={
                  sequenceId
                }
                onChange={(
                  event,
                ) =>
                  setSequenceId(
                    event.target
                      .value,
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"
              >
                <option value="">
                  Select sequence
                </option>

                {sequences.map(
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
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">
                Start at
              </span>

              <input
                type="datetime-local"
                value={
                  startAt
                }
                onChange={(
                  event,
                ) =>
                  setStartAt(
                    event.target
                      .value,
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"
              />
            </label>

            <label className="flex items-start gap-2 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3">
              <input
                type="checkbox"
                checked={
                  consentConfirmed
                }
                onChange={(
                  event,
                ) =>
                  setConsentConfirmed(
                    event.target
                      .checked,
                  )
                }
                className="mt-0.5 size-4 accent-primary"
              />

              <span className="text-xs leading-5 text-amber-200/80">
                I confirm the selected contacts have opted in to receive WhatsApp messages from this business.
              </span>
            </label>
          </div>
        )}

        {mode ===
          "freeform" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs leading-5 text-emerald-200">
              Free-form will be sent only to contacts whose 24-hour customer-service window is open. Closed-window contacts will be blocked.
            </div>

            <textarea
              value={message}
              onChange={(
                event,
              ) =>
                setMessage(
                  event.target
                    .value,
                )
              }
              rows={6}
              placeholder="Hi {{name}} 😊 Just checking in..."
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white placeholder-slate-500"
            />

            <p className="text-[11px] text-slate-500">
              Use{" "}
              <code>
                {"{{name}}"}
              </code>{" "}
              for contact-name personalization.
            </p>
          </div>
        )}

        {mode ===
          "template" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-200">
              Reminder uses an APPROVED WhatsApp template and can be used when the customer-service window is closed.
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">
                Approved template
              </span>

              <select
                value={
                  templateId
                }
                onChange={(
                  event,
                ) =>
                  setTemplateId(
                    event.target
                      .value,
                  )
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"
              >
                <option value="">
                  Select approved template
                </option>

                {templates.map(
                  (
                    template,
                  ) => (
                    <option
                      key={
                        template.id
                      }
                      value={
                        template.id
                      }
                    >
                      {
                        template.name
                      } —{" "}
                      {
                        template.language
                      }
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        )}

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-500">
          Need a sequence first?{" "}
          <Link
            href="/automations/new?preset=cold_lead_followup"
            className="font-medium text-primary hover:underline"
            onClick={() =>
              onOpenChange(
                false,
              )
            }
          >
            Create Cold Lead Sequence
          </Link>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() =>
              onOpenChange(
                false,
              )
            }
            disabled={loading}
            className="border-slate-700 text-slate-300"
          >
            Cancel
          </Button>

          <Button
            onClick={() =>
              void submit()
            }
            disabled={
              loading ||
              contacts.length ===
                0 ||
              (mode ===
                "sequence" &&
                !sequenceId) ||
              (mode ===
                "freeform" &&
                !message.trim()) ||
              (mode ===
                "template" &&
                !templateId)
            }
            className="bg-primary text-primary-foreground"
          >
            {loading && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}

            {mode ===
              "sequence"
              ? "Start Follow-up"
              : mode ===
                "freeform"
                ? "Send Free-form"
                : "Send Reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
