'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Task, Profile } from '@/types';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
Table,
TableBody,
TableCell,
TableHead,
TableHeader,
TableRow,
} from '@/components/ui/table';

import { Plus, Search, CheckCircle2, Clock3 } from 'lucide-react';

export default function TasksPage() {
const supabase = createClient();

const [tasks, setTasks] = useState<Task[]>([]);
const [profiles, setProfiles] = useState<Profile[]>([]);
const [loading, setLoading] = useState(true);
const [search, setSearch] = useState('');

const [open, setOpen] = useState(false);

const [title, setTitle] = useState('');
const [description, setDescription] = useState('');
const [priority, setPriority] = useState('medium');
const [dueAt, setDueAt] = useState('');
const [assignedTo, setAssignedTo] = useState<string>('unassigned');

const [saving, setSaving] = useState(false);
const [editingTask, setEditingTask] = useState<Task | null>(null);

const [editTitle, setEditTitle] = useState('');
const [editDescription, setEditDescription] = useState('');
const [editPriority, setEditPriority] = useState('medium');
const [editDueAt, setEditDueAt] = useState('');
const [editAssignedTo, setEditAssignedTo] = useState<string>('unassigned');

const [editOpen, setEditOpen] = useState(false);

const fetchTasks = useCallback(async () => {
setLoading(true);


let query = supabase
  .from('tasks')
  .select('*')
  .order('created_at', { ascending: false });

if (search.trim()) {
  query = query.ilike('title', `%${search}%`);
}

const { data, error } = await query;

if (error) {
  toast.error('Failed to load tasks');
  setLoading(false);
  return;
}

setTasks((data as Task[]) ?? []);
setLoading(false);


}, [supabase, search]);

useEffect(() => {
fetchTasks();
}, [fetchTasks]);
useEffect(() => {
  (async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');

    setProfiles((data ?? []) as Profile[]);
  })();
}, [supabase]);

const pendingCount = tasks.filter(
(t) => t.status !== 'completed'
).length;

const completedCount = tasks.filter(
(t) => t.status === 'completed'
).length;

const handleCreateTask = async () => {
  if (!title.trim()) {
    toast.error('Title is required');
    return;
  }

  try {
    setSaving(true);

    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
  title,
description,
priority,
due_at: dueAt || null,

  assigned_to:
    editAssignedTo && editAssignedTo !== 'unassigned'
      ? editAssignedTo
      : null,
}),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to create task');
    }

    toast.success('Task created');

    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueAt('');

    setAssignedTo('unassigned');

    setOpen(false);

    fetchTasks();
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : 'Failed to create task'
    );
  } finally {
    setSaving(false);
  }
};

const handleCompleteTask = async (id: string) => {
  try {
    const response = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'completed',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to complete task');
    }

    toast.success('Task completed');

    fetchTasks();
  } catch {
    toast.error('Failed to complete task');
  }
};

const handleDeleteTask = async (id: string) => {
  try {
    const response = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete task');
    }

    toast.success('Task deleted');

    fetchTasks();
  } catch {
    toast.error('Failed to delete task');
  }
};

const openEditDialog = (task: Task) => {
  setEditingTask(task);

  setEditTitle(task.title);
  setEditDescription(task.description ?? '');
  setEditPriority(task.priority);

  setEditDueAt(
    task.due_at
      ? task.due_at.slice(0, 10)
      : ''
  );
  setEditAssignedTo(
  task.assigned_to ?? 'unassigned'
);

  setEditOpen(true);
};

const handleUpdateTask = async () => {
  if (!editingTask) return;

  try {
    const response = await fetch(
      `/api/tasks/${editingTask.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
  title: editTitle,
description: editDescription,
priority: editPriority,
due_at: editDueAt || null,

  assigned_to:
    assignedTo && assignedTo !== 'unassigned'
      ? assignedTo
      : null,
}),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to update task');
    }

    toast.success('Task updated');

    setEditOpen(false);

    fetchTasks();
  } catch {
    toast.error('Failed to update task');
  }
};

return ( <div className="space-y-6"> <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"> <div> <h1 className="text-2xl font-bold text-white">Tasks</h1>


      <p className="text-sm text-slate-400 mt-1">
        Manage follow-ups and team tasks.
      </p>
    </div>

    <Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger
    render={
      <Button type="button">
        <Plus className="h-4 w-4 mr-2" />
        New Task
      </Button>
    }
  />

  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create Task</DialogTitle>
    </DialogHeader>

    <div className="space-y-4">
      <div>
        <Label>Title</Label>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Follow up lead"
        />
      </div>

      <div>
        <Label>Description</Label>

        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Task details..."
        />
      </div>

      <div>
        <Label>Priority</Label>

        <Select
           value={priority}
           onValueChange={(value) => {
             if (value) setPriority(value);
            }}
          >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Due Date</Label>

        <Input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
        />
      </div>
      <div>
  <Label>Assign To</Label>

  <Select
    value={assignedTo}
    onValueChange={(value) =>
  setAssignedTo((value ?? 'unassigned') as string)
}
  >
    <SelectTrigger>
      <SelectValue placeholder="Select team member" />
    </SelectTrigger>

    <SelectContent>
      <SelectItem value="unassigned">
        Unassigned
      </SelectItem>

      {profiles.map((p) => (
        <SelectItem
          key={p.user_id}
          value={p.user_id}
        >
          {p.full_name || p.email}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
      

      <Button
        onClick={handleCreateTask}
        disabled={saving || !title.trim()}
    >
        {saving ? 'Saving...' : 'Save Task'}
      </Button>
    </div>
  </DialogContent>
</Dialog>

<Dialog open={editOpen} onOpenChange={setEditOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit Task</DialogTitle>
    </DialogHeader>

    <div className="space-y-4">
      <div>
        <Label>Title</Label>

        <Input
          value={editTitle}
          onChange={(e) =>
            setEditTitle(e.target.value)
          }
        />
      </div>

      <div>
        <Label>Description</Label>

        <Textarea
          value={editDescription}
          onChange={(e) =>
            setEditDescription(e.target.value)
          }
        />
      </div>

      <div>
        <Label>Priority</Label>

        <Select
          value={editPriority}
          onValueChange={(value) => {
            if (value) setEditPriority(value);
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
        <Label>Due Date</Label>

        <Input
          type="date"
          value={editDueAt}
          onChange={(e) =>
            setEditDueAt(e.target.value)
          }
        />
      </div>

      <Button onClick={handleUpdateTask}>
        Save Changes
      </Button>
    </div>
  </DialogContent>
</Dialog>
  </div>

  <div className="grid gap-4 md:grid-cols-3">
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">
        Total Tasks
      </div>

      <div className="text-2xl font-bold">
        {tasks.length}
      </div>
    </div>

    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock3 className="h-4 w-4" />
        Pending
      </div>

      <div className="text-2xl font-bold">
        {pendingCount}
      </div>
    </div>

    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4" />
        Completed
      </div>

      <div className="text-2xl font-bold">
        {completedCount}
      </div>
    </div>
  </div>

  <div className="flex items-center gap-2">
    <Search className="h-4 w-4 text-muted-foreground" />

    <Input
      placeholder="Search tasks..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />
  </div>

  <div className="rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {!loading && tasks.length === 0 && (
          <TableRow>
            <TableCell colSpan={5}>
              No tasks found.
            </TableCell>
          </TableRow>
        )}

        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>{task.title}</TableCell>

            <TableCell>
  <span
    className={
      task.priority === 'high'
        ? 'text-red-500 font-medium'
        : task.priority === 'medium'
        ? 'text-yellow-500 font-medium'
        : 'text-green-500 font-medium'
    }
  >
    {task.priority}
  </span>
</TableCell>

            <TableCell>
  <span
    className={
      task.status === 'completed'
        ? 'text-green-500 font-medium'
        : 'text-orange-500 font-medium'
    }
  >
    {task.status}
  </span>
</TableCell>

            <TableCell>
  {task.due_at ? (
    <span
      className={
        new Date(task.due_at) < new Date() &&
        task.status !== 'completed'
          ? 'text-red-500 font-medium'
          : ''
      }
    >
      {new Date(task.due_at).toLocaleDateString()}
    </span>
  ) : (
    '-'
  )}
</TableCell>
            <TableCell>
  <div className="flex gap-2">
    
    <Button
  size="sm"
  variant="outline"
  onClick={() => openEditDialog(task)}
>
  Edit
</Button>
    {task.status !== 'completed' && (
      <Button
        size="sm"
        onClick={() => handleCompleteTask(task.id)}
      >
        Complete
      </Button>
    )}

    <Button
      size="sm"
      variant="destructive"
      onClick={() => handleDeleteTask(task.id)}
    >
      Delete
    </Button>
  </div>
</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
</div>


);
}
