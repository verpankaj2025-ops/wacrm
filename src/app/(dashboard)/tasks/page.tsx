"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/types";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  CheckCircle2,
  Clock3,
  ListTodo,
  Plus,
  Search,
  AlertCircle,
  Pencil,
  Trash2,
} from "lucide-react";

interface TeamMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

type TaskFilter =
  | "all"
  | "pending"
  | "overdue"
  | "today"
  | "completed";

const EMPTY_FORM = {
  title: "",
  description: "",
  priority: "medium",
  dueAt: "",
  assignedTo: "unassigned",
};

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const pad = (value: number) =>
    String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") +
    "T" +
    [
      pad(date.getHours()),
      pad(date.getMinutes()),
    ].join(":");
}

function isOverdue(task: Task): boolean {
  if (!task.due_at) return false;
  if (task.status === "completed") return false;

  return new Date(task.due_at).getTime() < Date.now();
}

function isToday(task: Task): boolean {
  if (!task.due_at) return false;

  const due = new Date(task.due_at);
  const now = new Date();

  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

function formatDueDate(value: string | null): string {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

export default function TasksPage() {
  const supabase = createClient();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filter, setFilter] =
    useState<TaskFilter>("all");

  const [createOpen, setCreateOpen] =
    useState(false);

  const [editOpen, setEditOpen] =
    useState(false);

  const [editingTask, setEditingTask] =
    useState<Task | null>(null);

  const [title, setTitle] = useState(
    EMPTY_FORM.title,
  );
  const [description, setDescription] =
    useState(EMPTY_FORM.description);
  const [priority, setPriority] =
    useState(EMPTY_FORM.priority);
  const [dueAt, setDueAt] =
    useState(EMPTY_FORM.dueAt);
  const [assignedTo, setAssignedTo] =
    useState(EMPTY_FORM.assignedTo);

  const [editTitle, setEditTitle] =
    useState("");
  const [editDescription, setEditDescription] =
    useState("");
  const [editPriority, setEditPriority] =
    useState("medium");
  const [editDueAt, setEditDueAt] =
    useState("");
  const [editAssignedTo, setEditAssignedTo] =
    useState("unassigned");

  const [saving, setSaving] =
    useState(false);

  const fetchTasks = useCallback(
    async () => {
      setLoading(true);

      let query = supabase
        .from("tasks")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (search.trim()) {
        query = query.ilike(
          "title",
          `%${search.trim()}%`,
        );
      }

      const {
        data,
        error,
      } = await query;

      if (error) {
        console.error(
          "Failed to load tasks:",
          error.message,
        );
        toast.error("Failed to load tasks");
        setTasks([]);
        setLoading(false);
        return;
      }

      setTasks((data as Task[]) ?? []);
      setLoading(false);
    },
    [supabase, search],
  );

  const fetchProfiles = useCallback(
    async () => {
      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .select(
          "user_id, full_name, email",
        )
        .order("full_name");

      if (error) {
        console.error(
          "Failed to load team:",
          error.message,
        );
        return;
      }

      setProfiles(
        (data ?? []) as TeamMember[],
      );
    },
    [supabase],
  );

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const profileName = useMemo(() => {
    const map = new Map<
      string,
      string
    >();

    for (const profile of profiles) {
      map.set(
        profile.user_id,
        profile.full_name ||
          profile.email ||
          "Team member",
      );
    }

    return map;
  }, [profiles]);

  const pendingCount = tasks.filter(
    (task) => task.status !== "completed",
  ).length;

  const completedCount = tasks.filter(
    (task) => task.status === "completed",
  ).length;

  const overdueCount = tasks.filter(
    isOverdue,
  ).length;

  const todayCount = tasks.filter(
    (task) =>
      isToday(task) &&
      task.status !== "completed",
  ).length;

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (
        filter === "completed" &&
        task.status !== "completed"
      ) {
        return false;
      }

      if (
        filter === "pending" &&
        task.status === "completed"
      ) {
        return false;
      }

      if (
        filter === "overdue" &&
        !isOverdue(task)
      ) {
        return false;
      }

      if (
        filter === "today" &&
        !isToday(task)
      ) {
        return false;
      }

      return true;
    });
  }, [tasks, filter]);

  const resetCreateForm = () => {
    setTitle(EMPTY_FORM.title);
    setDescription(
      EMPTY_FORM.description,
    );
    setPriority(EMPTY_FORM.priority);
    setDueAt(EMPTY_FORM.dueAt);
    setAssignedTo(
      EMPTY_FORM.assignedTo,
    );
  };

  const handleCreateTask = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        "/api/tasks",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            description:
              description.trim() || null,
            priority,
            due_at: dueAt || null,
            assigned_to:
              assignedTo !== "unassigned"
                ? assignedTo
                : null,
          }),
        },
      );

      const result =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Failed to create task",
        );
      }

      toast.success("Task created");

      resetCreateForm();
      setCreateOpen(false);

      await fetchTasks();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create task",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteTask =
    async (id: string) => {
      try {
        const response =
          await fetch(
            `/api/tasks/${id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                status: "completed",
              }),
            },
          );

        const result =
          await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result?.error ||
              "Failed to complete task",
          );
        }

        toast.success(
          "Task completed",
        );

        await fetchTasks();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to complete task",
        );
      }
    };

  const handleDeleteTask =
    async (id: string) => {
      try {
        const response =
          await fetch(
            `/api/tasks/${id}`,
            {
              method: "DELETE",
            },
          );

        const result =
          await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result?.error ||
              "Failed to delete task",
          );
        }

        toast.success(
          "Task deleted",
        );

        await fetchTasks();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to delete task",
        );
      }
    };

  const openEditDialog =
    (task: Task) => {
      setEditingTask(task);

      setEditTitle(task.title);
      setEditDescription(
        task.description ?? "",
      );
      setEditPriority(
        task.priority || "medium",
      );
      setEditDueAt(
        toDateTimeLocal(
          task.due_at,
        ),
      );
      setEditAssignedTo(
        task.assigned_to ??
          "unassigned",
      );

      setEditOpen(true);
    };

  const handleUpdateTask =
    async () => {
      if (!editingTask) return;

      if (!editTitle.trim()) {
        toast.error(
          "Title is required",
        );
        return;
      }

      try {
        setSaving(true);

        const response =
          await fetch(
            `/api/tasks/${editingTask.id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                title:
                  editTitle.trim(),
                description:
                  editDescription.trim() ||
                  null,
                priority:
                  editPriority,
                due_at:
                  editDueAt || null,
                assigned_to:
                  editAssignedTo !==
                  "unassigned"
                    ? editAssignedTo
                    : null,
              }),
            },
          );

        const result =
          await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result?.error ||
              "Failed to update task",
          );
        }

        toast.success(
          "Task updated",
        );

        setEditOpen(false);
        setEditingTask(null);

        await fetchTasks();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update task",
        );
      } finally {
        setSaving(false);
      }
    };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Tasks
          </h1>

          <p className="mt-1 text-sm text-slate-400">
            Manage follow-ups and team tasks.
          </p>
        </div>

        <Button
          type="button"
          onClick={() =>
            setCreateOpen(true)
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() =>
            setFilter("all")
          }
          className="rounded-lg border border-slate-700 p-4 text-left transition hover:bg-slate-800/60"
        >
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <ListTodo className="h-4 w-4" />
            Total
          </div>
          <div className="mt-1 text-2xl font-bold text-white">
            {tasks.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilter("pending")
          }
          className="rounded-lg border border-slate-700 p-4 text-left transition hover:bg-slate-800/60"
        >
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Clock3 className="h-4 w-4" />
            Pending
          </div>
          <div className="mt-1 text-2xl font-bold text-white">
            {pendingCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilter("overdue")
          }
          className="rounded-lg border border-red-900/50 p-4 text-left transition hover:bg-red-950/20"
        >
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" />
            Overdue
          </div>
          <div className="mt-1 text-2xl font-bold text-white">
            {overdueCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilter("completed")
          }
          className="rounded-lg border border-emerald-900/50 p-4 text-left transition hover:bg-emerald-950/20"
        >
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Completed
          </div>
          <div className="mt-1 text-2xl font-bold text-white">
            {completedCount}
          </div>
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
          />
        </div>

        <Select
          value={filter}
          onValueChange={(value) => {
            if (value) {
              setFilter(
                value as TaskFilter,
              );
            }
          }}
        >
          <SelectTrigger className="w-full md:w-44">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">
              All Tasks
            </SelectItem>
            <SelectItem value="pending">
              Pending
            </SelectItem>
            <SelectItem value="overdue">
              Overdue
            </SelectItem>
            <SelectItem value="today">
              Today
            </SelectItem>
            <SelectItem value="completed">
              Completed
            </SelectItem>
          </SelectContent>
        </Select>

        <div className="text-xs text-slate-500">
          Today: {todayCount}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {!loading &&
                visibleTasks.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-slate-500"
                    >
                      No tasks found.
                    </TableCell>
                  </TableRow>
                )}

              {loading && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-slate-500"
                  >
                    Loading tasks...
                  </TableCell>
                </TableRow>
              )}

              {visibleTasks.map(
                (task) => {
                  const overdue =
                    isOverdue(task);

                  return (
                    <TableRow
                      key={task.id}
                    >
                      <TableCell>
                        <div className="min-w-[220px]">
                          <div className="font-medium text-white">
                            {task.title}
                          </div>

                          {task.description && (
                            <div className="mt-1 max-w-md truncate text-xs text-slate-500">
                              {task.description}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <span
                          className={
                            task.priority ===
                            "high"
                              ? "font-medium text-red-400"
                              : task.priority ===
                                  "medium"
                                ? "font-medium text-yellow-400"
                                : "font-medium text-emerald-400"
                          }
                        >
                          {task.priority}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="text-sm text-slate-300">
                          {task.assigned_to
                            ? profileName.get(
                                task.assigned_to,
                              ) ||
                              "Team member"
                            : "Unassigned"}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span
                          className={
                            task.status ===
                            "completed"
                              ? "font-medium text-emerald-400"
                              : overdue
                                ? "font-medium text-red-400"
                                : "font-medium text-orange-400"
                          }
                        >
                          {task.status}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span
                          className={
                            overdue
                              ? "font-medium text-red-400"
                              : "text-slate-300"
                          }
                        >
                          {formatDueDate(
                            task.due_at,
                          )}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              openEditDialog(
                                task,
                              )
                            }
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>

                          {task.status !==
                            "completed" && (
                            <Button
                              size="sm"
                              onClick={() =>
                                handleCompleteTask(
                                  task.id,
                                )
                              }
                            >
                              Complete
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              handleDeleteTask(
                                task.id,
                              )
                            }
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                },
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* CREATE TASK */}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Create Task
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(event) =>
                  setTitle(
                    event.target.value,
                  )
                }
                placeholder="Follow up lead"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(event) =>
                  setDescription(
                    event.target.value,
                  )
                }
                placeholder="Task details..."
              />
            </div>

            <div>
              <Label>Priority</Label>

              <Select
                value={priority}
                onValueChange={(value) => {
                  if (value) {
                    setPriority(
                      value,
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="low">
                    Low
                  </SelectItem>
                  <SelectItem value="medium">
                    Medium
                  </SelectItem>
                  <SelectItem value="high">
                    High
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>
                Due Date & Time
              </Label>

              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(event) =>
                  setDueAt(
                    event.target.value,
                  )
                }
              />
            </div>

            <div>
              <Label>
                Assign To
              </Label>

              <Select
                value={assignedTo}
                onValueChange={(value) => {
                  if (value) {
                    setAssignedTo(
                      value,
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="unassigned">
                    Unassigned
                  </SelectItem>

                  {profiles.map(
                    (profile) => (
                      <SelectItem
                        key={
                          profile.user_id
                        }
                        value={
                          profile.user_id
                        }
                      >
                        {profile.full_name ||
                          profile.email ||
                          "Team member"}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setCreateOpen(false)
              }
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              onClick={
                handleCreateTask
              }
              disabled={saving}
            >
              {saving
                ? "Creating..."
                : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT TASK */}
      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit Task
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={editTitle}
                onChange={(event) =>
                  setEditTitle(
                    event.target.value,
                  )
                }
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={
                  editDescription
                }
                onChange={(event) =>
                  setEditDescription(
                    event.target.value,
                  )
                }
              />
            </div>

            <div>
              <Label>Priority</Label>

              <Select
                value={editPriority}
                onValueChange={(value) => {
                  if (value) {
                    setEditPriority(
                      value,
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="low">
                    Low
                  </SelectItem>
                  <SelectItem value="medium">
                    Medium
                  </SelectItem>
                  <SelectItem value="high">
                    High
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>
                Due Date & Time
              </Label>

              <Input
                type="datetime-local"
                value={editDueAt}
                onChange={(event) =>
                  setEditDueAt(
                    event.target.value,
                  )
                }
              />
            </div>

            <div>
              <Label>
                Assign To
              </Label>

              <Select
                value={
                  editAssignedTo
                }
                onValueChange={(value) => {
                  if (value) {
                    setEditAssignedTo(
                      value,
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="unassigned">
                    Unassigned
                  </SelectItem>

                  {profiles.map(
                    (profile) => (
                      <SelectItem
                        key={
                          profile.user_id
                        }
                        value={
                          profile.user_id
                        }
                      >
                        {profile.full_name ||
                          profile.email ||
                          "Team member"}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setEditOpen(false)
              }
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              onClick={
                handleUpdateTask
              }
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
