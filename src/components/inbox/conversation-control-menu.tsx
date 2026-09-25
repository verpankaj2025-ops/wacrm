"use client";

import {
  Bot,
  ChevronDown,
  CirclePause,
  LockKeyhole,
  LockKeyholeOpen,
  Play,
  UserRound,
  XCircle,
  RotateCcw,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type {
  ConversationControlAction,
} from "@/lib/conversations/control";

type ControlMode =
  | "ai"
  | "human"
  | "paused";

interface ConversationControlMenuProps {
  mode: ControlMode;
  status: "open" | "pending" | "closed";
  busy?: boolean;
  onAction: (
    action: ConversationControlAction,
  ) => void;
}

export function ConversationControlMenu({
  mode,
  status,
  busy = false,
  onAction,
}: ConversationControlMenuProps) {
  const label =
    mode === "ai"
      ? "AI"
      : mode === "human"
        ? "Human"
        : "Paused";

  const Icon =
    mode === "ai"
      ? Bot
      : mode === "human"
        ? UserRound
        : CirclePause;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        className="inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs text-slate-300 hover:bg-slate-800"
        aria-label="Conversation control"
        title="Conversation control"
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="hidden md:inline">
          {label}
        </span>
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="border-slate-700 bg-slate-800"
      >
        {mode === "ai" && (
          <>
            <DropdownMenuItem
              onClick={() =>
                onAction("handoff")
              }
              className="text-sm text-slate-200"
            >
              <UserRound className="mr-2 h-4 w-4" />
              Take over
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() =>
                onAction("pause_ai")
              }
              className="text-sm text-amber-300"
            >
              <CirclePause className="mr-2 h-4 w-4" />
              Pause automation
            </DropdownMenuItem>
          </>
        )}

        {mode === "human" && (
          <DropdownMenuItem
            onClick={() =>
              onAction("resume_ai")
            }
            className="text-sm text-primary"
          >
            <Play className="mr-2 h-4 w-4" />
            Enable AI
          </DropdownMenuItem>
        )}

        {mode === "paused" && (
          <DropdownMenuItem
            onClick={() =>
              onAction("resume_ai")
            }
            className="text-sm text-primary"
          >
            <Play className="mr-2 h-4 w-4" />
            Resume AI
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="bg-slate-700" />

        <DropdownMenuItem
          onClick={() =>
            onAction("claim")
          }
          className="text-sm text-slate-200"
        >
          <LockKeyhole className="mr-2 h-4 w-4" />
          Claim
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() =>
            onAction("release")
          }
          className="text-sm text-slate-400"
        >
          <LockKeyholeOpen className="mr-2 h-4 w-4" />
          Release claim
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-slate-700" />

        {status === "closed" ? (
          <DropdownMenuItem
            onClick={() =>
              onAction("reopen")
            }
            className="text-sm text-primary"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reopen conversation
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() =>
              onAction("close")
            }
            className="text-sm text-red-300"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Close conversation
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
