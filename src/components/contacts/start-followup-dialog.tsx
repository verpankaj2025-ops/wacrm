"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MessageCircle, PlayCircle } from "lucide-react";
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

type Sequence = {
  id: string;
  name: string;
  is_active: boolean;
};

function localDateTimeInput() {
  const now = new Date();
  const rounded =
    new Date(
      Math.ceil(
        now.getTime() / (5 * 60 * 1000),
      ) *
        (5 * 60 * 1000),
    );

  const local = new Date(
    rounded.getTime() -
      rounded.getTimezoneOffset() * 60 * 1000,
  );

  return local
    .toISOString()
    .slice(0, 16);
}

export function StartFollowUpDialog({
  open,
  contact,
  onOpenChange,
  onStarted,
}: {
  open: boolean;
  contact: Contact | null;
  onOpenChange: (open: boolean) => void;
  onStarted?: () => void;
}) {
  const [sequences, setSequences] =
    useState<Sequence[]>([]);
  const [sequenceId, setSequenceId] =
    useState("");
  const [startAt, setStartAt] =
    useState(localDateTimeInput());
  const [consentConfirmed, setConsentConfirmed] =
    useState(false);
  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    if (!open) return;

    setStartAt(
      localDateTimeInput(),
    );
    setConsentConfirmed(false);

    void (async () => {
      try {
        const response =
          await fetch("/api/automations", {
            cache: "no-store",
          });

        const payload =
          await response.json();

        if (!response.ok) {
          throw new Error(
            payload?.error ??
              "Unable to load follow-up sequences.",
          );
        }

        const active =
          (payload.automations ?? [])
            .filter(
              (automation: Sequence) =>
                automation.is_active,
            );

        setSequences(active);

        if (active.length > 0) {
          setSequenceId(
            active[0].id,
          );
        } else {
          setSequenceId("");
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load follow-up sequences.",
        );
      }
    })();
  }, [open]);

  const selectedSequence = useMemo(
    () =>
      sequences.find(
        (sequence) =>
          sequence.id ===
          sequenceId,
      ) ?? null,
    [sequences, sequenceId],
  );

  async function startFollowUp() {
    if (!contact) return;

    if (!sequenceId) {
      toast.error(
        "Select a follow-up sequence.",
      );
      return;
    }

    if (!consentConfirmed) {
      toast.error(
        "Confirm WhatsApp opt-in before starting the sequence.",
      );
      return;
    }

    setLoading(true);

    try {
      const startIso =
        new Date(startAt).toISOString();

      const response =
        await fetch(
          `/api/contacts/${contact.id}/followup`,
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body: JSON.stringify({
              automation_id:
                sequenceId,
              start_at:
                startIso,
              consent_confirmed:
                true,
            }),
          },
        );

      const payload =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            "Unable to start follow-up.",
        );
      }

      toast.success(
        `Follow-up started: ${payload.sequence}`,
      );

      onOpenChange(false);
      onStarted?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to start follow-up.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="border-slate-700 bg-slate-900 text-slate-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Start WhatsApp Follow-up
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {contact
              ? `Start a managed sequence for ${contact.name || contact.phone}.`
              : "Start a managed sequence for this contact."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <MessageCircle className="mt-0.5 size-5 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">
                  24-hour WhatsApp safety is automatic
                </p>
                <p className="text-xs leading-5 text-slate-400">
                  For a cold lead outside the 24-hour customer
                  window, the sequence must begin with an
                  approved WhatsApp template. Once the customer
                  replies, later Send Message steps can use
                  free-form text while the 24-hour window is open.
                </p>
              </div>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">
              Follow-up sequence
            </span>

            <select
              value={sequenceId}
              onChange={(event) =>
                setSequenceId(
                  event.target.value,
                )
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"
            >
              <option value="">
                Select sequence
              </option>

              {sequences.map(
                (sequence) => (
                  <option
                    key={sequence.id}
                    value={sequence.id}
                  >
                    {sequence.name}
                  </option>
                ),
              )}
            </select>

            {!selectedSequence && (
              <p className="mt-2 text-xs text-amber-300">
                No active sequence selected.
              </p>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">
              Start at
            </span>

            <input
              type="datetime-local"
              value={startAt}
              onChange={(event) =>
                setStartAt(
                  event.target.value,
                )
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white"
            />
          </label>

          <label className="flex items-start gap-2 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(event) =>
                setConsentConfirmed(
                  event.target.checked,
                )
              }
              className="mt-0.5 size-4 accent-primary"
            />

            <span className="text-xs leading-5 text-amber-200/80">
              I confirm this lead has opted in to receive
              WhatsApp messages from this business.
            </span>
          </label>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-500">
            Need to create a new sequence first?{" "}
            <Link
              href="/automations/new?preset=cold_lead_followup"
              className="font-medium text-primary hover:underline"
              onClick={() =>
                onOpenChange(false)
              }
            >
              Create Cold Lead Sequence
            </Link>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onOpenChange(false)
            }
            className="border-slate-700 text-slate-300"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={() =>
              void startFollowUp()
            }
            disabled={
              loading ||
              !contact ||
              !sequenceId
            }
            className="bg-primary text-primary-foreground"
          >
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 size-4" />
            )}
            Start Follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
