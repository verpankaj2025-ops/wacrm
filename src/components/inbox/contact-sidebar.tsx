"use client";

import { DealForm } from "@/components/pipelines/deal-form";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type {
  Contact,
  Deal,
  ContactNote,
  Tag,
  Pipeline,
  PipelineStage,
} from "@/types";

import {
  Phone,
  Mail,
  Copy,
  Check,
  User,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface ContactSidebarProps {
  contact: Contact | null;
}

export function ContactSidebar({ contact }: ContactSidebarProps) {
  const [dealOpen, setDealOpen] = useState(false);

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [members, setMembers] = useState<
  { user_id: string; full_name: string }[]
  >([]);

  const [updatingStatus, setUpdatingStatus] = useState(false);


  const fetchContactData = useCallback(async () => {
    if (!contact) return;

  const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);
  useEffect(() => {
  if (!accountId) return;

  const loadPipeline = async () => {
    const supabase = createClient();

    const { data: pipelineRows } = await supabase
      .from("pipelines")
      .select("*")
      .limit(1);

    if (!pipelineRows?.length) return;

    setPipelines(pipelineRows as Pipeline[]);

    const { data: stageRows } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", pipelineRows[0].id)
      .order("position");

    setStages((stageRows ?? []) as PipelineStage[]);
  };

  loadPipeline();
}, [accountId]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
  async function loadMembers() {
    try {
      const res = await fetch("/api/account/members");

      if (!res.ok) return;

      const data = await res.json();

      setMembers(data.members || []);
    } catch (err) {
      console.error(err);
    }
  }

  loadMembers();
}, []);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  const createTask = useCallback(async () => {
  if (!contact || !taskTitle.trim()) {
    toast.error("Task title is required");
    return;
  }

  setCreatingTask(true);

  try {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: taskTitle.trim(),
        description: taskDescription.trim() || null,
        contact_id: contact.id,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    toast.success("Task created");

    setTaskTitle("");
    setTaskDescription("");
    setTaskDialogOpen(false);
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "Failed to create task"
    );
  }

  setCreatingTask(false);
}, [contact, taskTitle, taskDescription]);

const updateLeadStatus = useCallback(
  async (status: string) => {
    if (!contact) return;

    setUpdatingStatus(true);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("contacts")
        .update({
          lead_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contact.id);

      if (error) throw error;

      toast.success("Lead status updated");

      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update status"
      );
    }

    setUpdatingStatus(false);
  },
  [contact]
);

const updateAssignedUser = useCallback(
  async (userId: string) => {
    if (!contact) return;

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("contacts")
        .update({
          assigned_to: userId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contact.id);

      if (error) throw error;

      toast.success("Lead assigned");

      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to assign lead"
      );
    }
  },
  [contact]
);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-slate-800 bg-slate-900">
        <p className="text-sm text-slate-500">Select a conversation</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-slate-800 bg-slate-900">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700 text-lg font-semibold text-white">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">
              {displayName}
            </h3>

            {contact.lead_source && (
  <div className="mt-2">
    <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300 border border-slate-700">
      Source: {contact.lead_source}
    </span>
  </div>
)}

<div className="mt-2">
  <select
    value={contact.lead_status || "new"}
    disabled={updatingStatus}
    onChange={(e) => updateLeadStatus(e.target.value)}
    className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white"
  >
    <option value="new">New</option>
    <option value="contacted">Contacted</option>
    <option value="interested">Interested</option>
    <option value="booked">Booked</option>
    <option value="completed">Completed</option>
    <option value="lost">Lost</option>
  </select>
</div>

      <div className="mt-3">
  <select
    value={contact.assigned_to || ""}
    onChange={(e) => updateAssignedUser(e.target.value)}
    className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"
  >
    <option value="">
      Unassigned
    </option>

    {members.map((member) => (
      <option
        key={member.user_id}
        value={member.user_id}
      >
        {member.full_name}
      </option>
    ))}
  </select>
</div>

<div className="mt-3">
  <Button
    size="sm"
    onClick={() => setTaskDialogOpen(true)}
    className="w-full"
  >
    <Plus className="h-4 w-4 mr-1" />
    Create Task
  </Button>

  <div className="mt-2">
  <Button
    size="sm"
    variant="outline"
    onClick={() => setDealOpen(true)}
    className="w-full"
  >
    Create Deal
  </Button>
</div>
</div>

            {contact.company && (
              <p className="text-xs text-slate-400">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
            >
              <Phone className="h-4 w-4 text-slate-500" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-slate-600" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300">
                <Mail className="h-4 w-4 text-slate-500" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-slate-800" />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              <TagIcon className="h-3 w-3" />
              Tags
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-slate-600">No tags</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-slate-800" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              <DollarSign className="h-3 w-3" />
              Active Deals
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-slate-600">No deals</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-slate-800 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-white">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-slate-800" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              <StickyNote className="h-3 w-3" />
              Notes
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-slate-800 px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-slate-300">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
            </ScrollArea>

      <Dialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
      >
        <DialogContent className="bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Task title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />

            <Textarea
              placeholder="Description"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
            />

            <Button
              onClick={createTask}
              disabled={creatingTask}
              className="w-full"
            >
              {creatingTask ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create Task"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {pipelines.length > 0 && stages.length > 0 && (
  <DealForm
    open={dealOpen}
    onOpenChange={setDealOpen}
    deal={null}
    pipelineId={pipelines[0].id}
    stages={stages}
    defaultStageId={stages[0]?.id}
    defaultContactId={contact?.id}
    onSaved={() => {
      toast.success("Deal created");
    }}
  />
)}

    </div>
  );
}
