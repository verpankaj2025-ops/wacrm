"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus } from "@/types";
import { Search, ChevronDown, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  resyncToken?: number;
}

const PAGE_SIZE = 50;

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  closed: "bg-slate-500",
};

const FILTER_OPTIONS: {
  label: string;
  value: ConversationStatus | "all";
}[] = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Pending", value: "pending" },
  { label: "Closed", value: "closed" },
];

function mergeConversations(
  current: Conversation[],
  incoming: Conversation[],
): Conversation[] {
  const map = new Map<string, Conversation>();

  for (const conversation of current) {
    map.set(conversation.id, conversation);
  }

  for (const conversation of incoming) {
    const existing = map.get(conversation.id);

    map.set(
      conversation.id,
      existing
        ? {
            ...existing,
            ...conversation,
            contact:
              conversation.contact ?? existing.contact,
          }
        : conversation,
    );
  }

  return [...map.values()].sort((a, b) => {
    const aTime = a.last_message_at
      ? new Date(a.last_message_at).getTime()
      : 0;

    const bTime = b.last_message_at
      ? new Date(b.last_message_at).getTime()
      : 0;

    return bTime - aTime;
  });
}

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    ConversationStatus | "all"
  >("all");

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const loadingMoreRef = useRef(false);
  const onConversationsLoadedRef =
    useRef(onConversationsLoaded);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    onConversationsLoadedRef.current =
      onConversationsLoaded;
  }, [onConversationsLoaded]);

  const fetchLatestPage = useCallback(
    async (merge = false) => {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("conversations")
        .select("*, contact:contacts(*)")
        .order("last_message_at", {
          ascending: false,
          nullsFirst: false,
        })
        .limit(PAGE_SIZE);

      if (error) {
        console.error(
          "Failed to fetch conversations:",
          {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          },
        );

        return;
      }

      const rows = (data ?? []) as Conversation[];

      cursorRef.current =
        rows.at(-1)?.last_message_at ?? null;

      setHasMore(rows.length === PAGE_SIZE);

      if (merge) {
        onConversationsLoadedRef.current(
          mergeConversations(
            conversationsRef.current,
            rows,
          ),
        );
      } else {
        onConversationsLoadedRef.current(rows);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const supabase = createClient();

      const { data, error } = await supabase
        .from("conversations")
        .select("*, contact:contacts(*)")
        .order("last_message_at", {
          ascending: false,
          nullsFirst: false,
        })
        .limit(PAGE_SIZE);

      if (cancelled) return;

      if (error) {
        console.error(
          "Failed to fetch conversations:",
          {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          },
        );

        setLoading(false);
        return;
      }

      const rows = (data ?? []) as Conversation[];

      cursorRef.current =
        rows.at(-1)?.last_message_at ?? null;

      setHasMore(rows.length === PAGE_SIZE);

      onConversationsLoadedRef.current(rows);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (resyncToken === 0) return;

    void fetchLatestPage(true);
  }, [resyncToken, fetchLatestPage]);

  const loadMore = useCallback(async () => {
    if (
      loadingMoreRef.current ||
      !hasMore ||
      !cursorRef.current
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("conversations")
        .select("*, contact:contacts(*)")
        .lt(
          "last_message_at",
          cursorRef.current,
        )
        .order("last_message_at", {
          ascending: false,
          nullsFirst: false,
        })
        .limit(PAGE_SIZE);

      if (error) {
        console.error(
          "Failed to load more conversations:",
          {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          },
        );
        return;
      }

      const rows = (data ?? []) as Conversation[];

      if (rows.length === 0) {
        setHasMore(false);
        return;
      }

      cursorRef.current =
        rows.at(-1)?.last_message_at ?? null;

      setHasMore(rows.length === PAGE_SIZE);

      onConversationsLoadedRef.current(
        mergeConversations(
          conversationsRef.current,
          rows,
        ),
      );
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;

    if (!element) return;

    const remaining =
      element.scrollHeight -
      element.scrollTop -
      element.clientHeight;

    if (remaining < 240) {
      void loadMore();
    }
  }, [loadMore]);

  useEffect(() => {
    const element = scrollRef.current;

    if (!element) return;

    element.addEventListener(
      "scroll",
      handleScroll,
      { passive: true },
    );

    return () => {
      element.removeEventListener(
        "scroll",
        handleScroll,
      );
    };
  }, [handleScroll]);

  const filtered = useMemo(() => {
    let result = conversations;

    if (filter !== "all") {
      result = result.filter(
        (conversation) =>
          conversation.status === filter,
      );
    }

    const query = search.trim().toLowerCase();

    if (query) {
      result = result.filter((conversation) => {
        const name =
          conversation.contact?.name?.toLowerCase() ??
          "";

        const phone =
          conversation.contact?.phone?.toLowerCase() ??
          "";

        const message =
          conversation.last_message_text?.toLowerCase() ??
          "";

        return (
          name.includes(query) ||
          phone.includes(query) ||
          message.includes(query)
        );
      });
    }

    return result;
  }, [conversations, filter, search]);

  const activeFilter = FILTER_OPTIONS.find(
    (option) => option.value === filter,
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r border-slate-800 bg-slate-900 lg:w-80">
      <div className="shrink-0 space-y-2 border-b border-slate-800 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

          <Input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search conversations..."
            className="border-slate-700 bg-slate-800 pl-9 text-sm text-white placeholder-slate-500 focus:border-primary/50"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-white">
            {activeFilter?.label ?? "All"}
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            className="border-slate-700 bg-slate-800"
          >
            {FILTER_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() =>
                  setFilter(option.value)
                }
                className={cn(
                  "text-sm",
                  filter === option.value
                    ? "text-primary"
                    : "text-slate-300",
                )}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-slate-500">
              No conversations found
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col">
              {filtered.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={
                    conversation.id ===
                    activeConversationId
                  }
                  onSelect={onSelect}
                />
              ))}
            </div>

            {loadingMore && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more conversations...
              </div>
            )}

            {!hasMore &&
              conversations.length >= PAGE_SIZE && (
                <div className="py-3 text-center text-[11px] text-slate-600">
                  All conversations loaded
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: ConversationItemProps) {
  const contact = conversation.contact;

  const displayName =
    contact?.name || contact?.phone || "Unknown";

  const leadSource =
    contact?.lead_source ?? "whatsapp";

  const initials =
    displayName.charAt(0).toUpperCase();

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(
        new Date(
          conversation.last_message_at,
        ),
        { addSuffix: false },
      )
    : "";

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation)}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-800/50",
        isActive &&
          "border-l-2 border-primary bg-slate-800/70",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-white">
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">
              {displayName}
            </span>

            <span className="text-[10px] uppercase text-slate-500">
              {leadSource}
            </span>
          </div>

          <span className="shrink-0 text-[10px] text-slate-500">
            {timeAgo}
          </span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-slate-400">
            {conversation.last_message_text ||
              "No messages yet"}
          </p>

          <div className="flex shrink-0 items-center gap-1.5">
            {conversation.unread_count > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conversation.unread_count}
              </span>
            )}

            <span
              className={cn(
                "h-2 w-2 rounded-full",
                STATUS_COLORS[
                  conversation.status
                ],
              )}
              title={conversation.status}
            />
          </div>
        </div>
      </div>
    </button>
  );
}
