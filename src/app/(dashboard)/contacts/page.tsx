'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Plus,
  Upload,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ContactForm } from '@/components/contacts/contact-form';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ImportModal } from '@/components/contacts/import-modal';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';

const PAGE_SIZE = 25;

interface ContactWithTags extends Contact {
  tags?: Tag[];
}

type ProfileLite = {
  user_id: string;
  full_name: string;
};

export default function ContactsPage() {
  const supabase = createClient();
  const router = useRouter();
  const canEdit = useCan('send-messages');

  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [leadFilter, setLeadFilter] = useState<
  'all' | 'assigned' | 'unassigned'
>('all');

const [statusFilter, setStatusFilter] = useState('all');
const [sourceFilter, setSourceFilter] = useState('all');

const [page, setPage] = useState(0);
const [totalCount, setTotalCount] = useState(0);

  // Modals
const [formOpen, setFormOpen] = useState(false);
const [editContact, setEditContact] = useState<Contact | null>(null);
const [editContactTags, setEditContactTags] = useState<ContactTag[]>([]);
const [detailOpen, setDetailOpen] = useState(false);
const [detailContactId, setDetailContactId] = useState<string | null>(null);
const [importOpen, setImportOpen] = useState(false);
const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
const [deleting, setDeleting] = useState(false);

  // All tags for display
const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});

const [profiles, setProfiles] = useState<ProfileLite[]>([]);

const [selectedContacts, setSelectedContacts] = useState<
  Record<string, ContactWithTags>
>({});

const [selectingAll, setSelectingAll] = useState(false);
const [downloadingSelected, setDownloadingSelected] = useState(false);

const fetchTags = useCallback(async () => {
const { data } = await supabase.from('tags').select('*');
    if (data) {
const map: Record<string, Tag> = {};
    data.forEach((t) => (map[t.id] = t));
      setTagsMap(map);
    }
  }, [supabase]);

const loadAllFilteredContacts = useCallback(async () => {
  const batchSize = 500;
  let offset = 0;
  const rows: ContactWithTags[] = [];

  while (true) {
    let query = supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(
        `name.ilike.${term},phone.ilike.${term},email.ilike.${term}`,
      );
    }

    if (leadFilter === 'assigned') {
      query = query.not('assigned_to', 'is', null);
    }

    if (leadFilter === 'unassigned') {
      query = query.is('assigned_to', null);
    }

    if (statusFilter !== 'all') {
      query = query.eq('lead_status', statusFilter);
    }

    if (sourceFilter !== 'all') {
      query = query.eq('lead_source', sourceFilter);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const pageRows = (data ?? []) as ContactWithTags[];
    rows.push(...pageRows);

    if (pageRows.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return rows;
}, [
  supabase,
  search,
  leadFilter,
  statusFilter,
  sourceFilter,
]);

const toggleContactSelection = useCallback(
  (contact: ContactWithTags) => {
    setSelectedContacts((prev) => {
      const next = { ...prev };

      if (next[contact.id]) {
        delete next[contact.id];
      } else {
        next[contact.id] = contact;
      }

      return next;
    });
  },
  [],
);

const handleSelectAll = useCallback(async () => {
  setSelectingAll(true);

  try {
    const rows = await loadAllFilteredContacts();

    setSelectedContacts((prev) => {
      const next = { ...prev };

      for (const contact of rows) {
        next[contact.id] = contact;
      }

      return next;
    });

    toast.success(
      `${rows.length} contacts selected from the current filtered list.`,
    );
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : 'Failed to select contacts.',
    );
  } finally {
    setSelectingAll(false);
  }
}, [loadAllFilteredContacts]);

const handleDeselectAll = useCallback(() => {
  setSelectedContacts({});
  toast.success('All selections cleared.');
}, []);

const handleDownloadSelected = useCallback(async () => {
  const ids = Object.keys(selectedContacts);

  if (ids.length === 0) {
    toast.error('Select at least one contact first.');
    return;
  }

  setDownloadingSelected(true);

  try {
    const selectedRows: ContactWithTags[] = [];
    const batchSize = 500;

    for (let index = 0; index < ids.length; index += batchSize) {
      const batch = ids.slice(index, index + batchSize);

      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .in('id', batch)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      selectedRows.push(
        ...((data ?? []) as ContactWithTags[]),
      );
    }

    const rows = selectedRows.map((contact) => ({
      ID: contact.id,
      Name: contact.name ?? '',
      Phone: contact.phone ?? '',
      Email: contact.email ?? '',
      Company: contact.company ?? '',
      'Lead Status': contact.lead_status ?? '',
      'Lead Source': contact.lead_source ?? '',
      'Assigned To':
        profiles.find(
          (profile) =>
            profile.user_id === contact.assigned_to,
        )?.full_name ?? 'Unassigned',
      'Tags':
        contact.tags?.map((tag) => tag.name).join(', ') ?? '',
      'Created At': contact.created_at ?? '',
      'Updated At': contact.updated_at ?? '',
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet['!cols'] = [
      { wch: 38 },
      { wch: 26 },
      { wch: 20 },
      { wch: 30 },
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
      { wch: 22 },
      { wch: 35 },
      { wch: 24 },
      { wch: 24 },
    ];

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Contacts',
    );

    const stamp = new Date()
      .toISOString()
      .slice(0, 10);

    XLSX.writeFile(
      workbook,
      `WACRM_Selected_Contacts_${stamp}.xlsx`,
    );

    toast.success(
      `${selectedRows.length} contacts downloaded.`,
    );
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : 'Failed to download selected contacts.',
    );
  } finally {
    setDownloadingSelected(false);
  }
}, [selectedContacts, supabase, profiles]);

const selectedCount = Object.keys(selectedContacts).length;

const allVisibleSelected =
  contacts.length > 0 &&
  contacts.every(
    (contact) => !!selectedContacts[contact.id],
  );

const fetchContacts = useCallback(async () => {
    setLoading(true);

const from = page * PAGE_SIZE;
const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(
        `name.ilike.${term},phone.ilike.${term},email.ilike.${term}`,
      );
    }

    if (leadFilter === 'assigned') {
      query = query.not('assigned_to', 'is', null);
    }

    if (leadFilter === 'unassigned') {
      query = query.is('assigned_to', null);
    }

    if (statusFilter !== 'all') {
      query = query.eq('lead_status', statusFilter);
    }

    if (sourceFilter !== 'all') {
      query = query.eq('lead_source', sourceFilter);
    }

const { data, count, error } = await query;

    if (error) {
      toast.error('Failed to load contacts');
      setLoading(false);
      return;
    }

    setTotalCount(count ?? 0);

    if (!data || data.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    // Fetch tags for these contacts
    const contactIds = data.map((c) => c.id);
    const { data: contactTags } = await supabase
      .from('contact_tags')
      .select('contact_id, tag_id')
      .in('contact_id', contactIds);

    const tagsByContact: Record<string, string[]> = {};
    contactTags?.forEach((ct) => {
      if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
      tagsByContact[ct.contact_id].push(ct.tag_id);
    });

    const enriched: ContactWithTags[] = data.map((c) => ({
      ...c,
      tags: (tagsByContact[c.id] ?? [])
        .map((tid) => tagsMap[tid])
        .filter(Boolean),
    }));

    setContacts(enriched);
    setLoading(false);
  }, [
  supabase,
  page,
  search,
  tagsMap,
  leadFilter,
  statusFilter,
  sourceFilter,
]);

  // Load-once-on-mount-ish data fetches. Each setter inside runs
  // inside an async promise completion (Supabase await), not
  // synchronously in the effect body, so the cascade the lint rule
  // warns about doesn't apply here.
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
  (async () => {
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .order('full_name');

    setProfiles((data ?? []) as ProfileLite[]);
  })();
}, [supabase]);

  function openAddForm() {
    setEditContact(null);
    setEditContactTags([]);
    setFormOpen(true);
  }

  async function openEditForm(contact: Contact) {
    const { data } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('contact_id', contact.id);
    setEditContact(contact);
    setEditContactTags(data ?? []);
    setFormOpen(true);
  }

  function openDetail(contactId: string) {
    setDetailContactId(contactId);
    setDetailOpen(true);
  }

  async function openInbox(contact: Contact) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Please login again.');
        return;
      }

      const { data: existing, error: existingError } =
        await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', contact.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message);
      }

      if (existing?.id) {
        router.push(`/inbox?c=${existing.id}`);
        return;
      }

      const { data: profile, error: profileError } =
        await supabase
          .from('profiles')
          .select('account_id')
          .eq('user_id', user.id)
          .single();

      if (profileError || !profile?.account_id) {
        throw new Error(
          profileError?.message ??
            'Your profile is not linked to an account.',
        );
      }

      const { data: conversation, error: conversationError } =
        await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            account_id: profile.account_id,
            contact_id: contact.id,
            status: 'open',
            last_message_text: null,
            last_message_at: null,
            unread_count: 0,
          })
          .select('id')
          .single();

      if (conversationError || !conversation) {
        throw new Error(
          conversationError?.message ??
            'Could not create conversation.',
        );
      }

      router.push(`/inbox?c=${conversation.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to open WhatsApp chat.',
      );
    }
  }

  function confirmDelete(contact: Contact) {
    setDeleteTarget(contact);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error('Failed to delete contact');
    } else {
      toast.success('Contact deleted');

      setSelectedContacts((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });

      fetchContacts();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  function getAssignedName(userId?: string | null) {
  if (!userId) return 'Unassigned';

  const profile = profiles.find(
    (p) => p.user_id === userId
  );

  return profile?.full_name || 'Unknown User';
}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your contact list. {totalCount > 0 && `${totalCount} total contacts.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GatedButton
            variant="outline"
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={() => setImportOpen(true)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <Upload className="size-4" />
            Import
          </GatedButton>
          <GatedButton
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" />
            Add Contact
          </GatedButton>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
     <Button
     size="sm"
     variant={leadFilter === 'all' ? 'default' : 'outline'}
     onClick={() => {
      setPage(0);
      setLeadFilter('all');
      setSelectedContacts({});
    }}
  >
    All Leads
  </Button>

  <Button
    size="sm"
    variant={leadFilter === 'assigned' ? 'default' : 'outline'}
    onClick={() => {
      setPage(0);
      setLeadFilter('assigned');
      setSelectedContacts({});
    }}
  >
    Assigned
  </Button>

  <Button
    size="sm"
    variant={leadFilter === 'unassigned' ? 'default' : 'outline'}
    onClick={() => {
      setPage(0);
      setLeadFilter('unassigned');
      setSelectedContacts({});
    }}
  >
    Unassigned
  </Button>
</div>

<div className="flex gap-2 flex-wrap">
  <select
    value={statusFilter}
    onChange={(e) => {
      setStatusFilter(e.target.value);
      setPage(0);
      setSelectedContacts({});
    }}
    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
  >
    <option value="all">All Status</option>
    <option value="new">New</option>
    <option value="contacted">Contacted</option>
    <option value="interested">Interested</option>
    <option value="booked">Booked</option>
    <option value="completed">Completed</option>
    <option value="lost">Lost</option>
  </select>

  <select
    value={sourceFilter}
    onChange={(e) => {
      setSourceFilter(e.target.value);
      setPage(0);
      setSelectedContacts({});
    }}
    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
  >
    <option value="all">All Sources</option>
    <option value="whatsapp">WhatsApp</option>
    <option value="facebook">Facebook</option>
    <option value="website">Website</option>
    <option value="manual">Manual</option>
  </select>
</div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedContacts({});
            // Reset pagination when the query changes — the result
            // set shrinks/grows, page N may no longer be valid.
            setPage(0);
          }}
          placeholder="Search by name, phone, or email..."
          className="pl-8 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
        />
      </div>

      {/* Bulk contact actions */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSelectAll()}
            disabled={selectingAll || loading || totalCount === 0}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {selectingAll ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : null}
            Select All
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleDeselectAll}
            disabled={selectedCount === 0}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Deselect All
          </Button>

          <span className="text-xs text-slate-500">
            {selectedCount} selected
            {search.trim() ||
            leadFilter !== 'all' ||
            statusFilter !== 'all' ||
            sourceFilter !== 'all'
              ? ' from current filters'
              : ''}
          </span>
        </div>

        <Button
          size="sm"
          onClick={() => void handleDownloadSelected()}
          disabled={selectedCount === 0 || downloadingSelected}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {downloadingSelected ? (
            <Loader2 className="mr-2 size-3.5 animate-spin" />
          ) : (
            <Download className="mr-2 size-3.5" />
          )}
          Download Selected
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="w-12 text-slate-400">
                <input
                  type="checkbox"
                  aria-label={
                    allVisibleSelected
                      ? 'Deselect visible contacts'
                      : 'Select visible contacts'
                  }
                  checked={allVisibleSelected}
                  onChange={() => {
                    if (allVisibleSelected) {
                      setSelectedContacts((prev) => {
                        const next = { ...prev };
                        for (const contact of contacts) {
                          delete next[contact.id];
                        }
                        return next;
                      });
                    } else {
                      setSelectedContacts((prev) => {
                        const next = { ...prev };
                        for (const contact of contacts) {
                          next[contact.id] = contact;
                        }
                        return next;
                      });
                    }
                  }}
                  className="size-4 cursor-pointer accent-primary"
                />
              </TableHead>
              <TableHead className="text-slate-400">Name</TableHead>
              <TableHead className="text-slate-400">Phone</TableHead>
              <TableHead className="text-slate-400 hidden md:table-cell">Email</TableHead>
              <TableHead className="text-slate-400 hidden lg:table-cell">Company</TableHead>
              <TableHead className="text-slate-400 hidden md:table-cell">Tags</TableHead>
              <TableHead className="text-slate-400 hidden lg:table-cell">
                 Lead Status
              </TableHead>

              <TableHead className="text-slate-400 hidden lg:table-cell">
                 Source
              </TableHead>

              <TableHead className="text-slate-400 hidden lg:table-cell">
   Assigned To
</TableHead>

              <TableHead className="text-slate-400 hidden lg:table-cell">Created</TableHead>
              <TableHead className="text-slate-400 w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-slate-800">
                <TableCell colSpan={11} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-slate-500">Loading contacts...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow className="border-slate-800">
                <TableCell colSpan={11} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-slate-600" />
                    <p className="text-sm text-slate-500">
                      {search ? 'No contacts match your search.' : 'No contacts yet.'}
                    </p>
                    {!search && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openAddForm}
                        className="mt-2 border-slate-700 text-slate-300 hover:bg-slate-800"
                      >
                        <Plus className="size-3.5" />
                        Add your first contact
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className={`border-slate-800 hover:bg-slate-900/50 cursor-pointer ${
                    selectedContacts[contact.id]
                      ? 'bg-primary/5'
                      : ''
                  }`}
                  onClick={() => openDetail(contact.id)}
                >
                  <TableCell
                    className="w-12"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${
                        contact.name || contact.phone
                      }`}
                      checked={!!selectedContacts[contact.id]}
                      onChange={() =>
                        toggleContactSelection(contact)
                      }
                      className="size-4 cursor-pointer accent-primary"
                    />
                  </TableCell>

                  <TableCell className="text-white font-medium">
                    {contact.name || <span className="text-slate-500 italic">Unnamed</span>}
                  </TableCell>
                  <TableCell className="text-slate-300 font-mono text-xs">
                    {contact.phone}
                  </TableCell>
                  <TableCell className="text-slate-400 hidden md:table-cell text-sm">
                    {contact.email || <span className="text-slate-600">-</span>}
                  </TableCell>
                  <TableCell className="text-slate-400 hidden lg:table-cell text-sm">
                    {contact.company || <span className="text-slate-600">-</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags && contact.tags.length > 0 ? (
                        contact.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-600 text-xs">-</span>
                      )}
                      {contact.tags && contact.tags.length > 3 && (
                        <span className="text-[10px] text-slate-500">
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="hidden lg:table-cell">
                    <span className="text-xs text-slate-300">
                       {contact.lead_status || 'new'}
                     </span>
                   </TableCell>

                   <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-slate-400">
                         {contact.lead_source || '-'}
                      </span>
                    </TableCell>

                   <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-slate-400">
                          {getAssignedName(contact.assigned_to)}
                      </span>
                   </TableCell>

                   <TableCell className="hidden lg:table-cell">
                       <span className="text-xs text-slate-400">
                         {contact.lead_source || 'whatsapp'}
                      </span>
                    </TableCell>

                  <TableCell className="text-slate-500 text-xs hidden lg:table-cell">
                    {new Date(contact.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-slate-400 hover:text-white"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-slate-900 border-slate-700"
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            void openInbox(contact);
                          }}
                          className="text-slate-300 focus:bg-slate-800 focus:text-white"
                        >
                          <MessageCircle className="size-4" />
                          Open WhatsApp Chat
                        </DropdownMenuItem>

                        <DropdownMenuSeparator className="bg-slate-700" />

                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditForm(contact);
                          }}
                          className="text-slate-300 focus:bg-slate-800 focus:text-white"
                        >
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-slate-700" />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(contact);
                          }}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} of{' '}
            {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-slate-400 px-2">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        contactTags={editContactTags}
        onSaved={() => {
          fetchContacts();
          fetchTags();
        }}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contactId={detailContactId}
        onUpdated={fetchContacts}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchContacts}
      />

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-200 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Contact</DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to delete{' '}
              <span className="text-slate-200 font-medium">
                {deleteTarget?.name || deleteTarget?.phone}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-slate-900 border-slate-700">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
