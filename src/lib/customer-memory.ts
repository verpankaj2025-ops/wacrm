import { supabaseAdmin } from "@/lib/automations/admin-client"

export type CustomerMemoryValueType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "time"

export type CustomerMemorySource =
  | "customer"
  | "agent"
  | "system"
  | "import"

export interface CustomerMemory {
  id: string
  account_id: string
  contact_id: string
  memory_key: string
  memory_value: string
  value_type: CustomerMemoryValueType
  source: CustomerMemorySource
  confidence: number
  metadata: Record<string, unknown>
  first_seen_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

export interface MemoryFactInput {
  key: string
  value: string
  valueType?: CustomerMemoryValueType
  source?: CustomerMemorySource
  confidence?: number
  metadata?: Record<string, unknown>
}

const SERVICE_PATTERNS: Array<{
  key: string
  patterns: string[]
}> = [
  {
    key: "preferred_service",
    patterns: [
      "deep tissue",
      "swedish",
      "aroma",
      "aromatherapy",
      "couple spa",
      "couples spa",
      "couple massage",
      "thai massage",
      "balinese",
      "hot stone",
      "body scrub",
      "body wrap",
      "four hand",
    ],
  },
]

const LOCATION_PATTERN =
  /(?:i(?:'m| am)?\s+(?:in|from)|i live in|mera(?:\s+)?location\s+(?:hai|is)|main\s+(.+?)\s+se\s+(?:hoon|hu)|location\s*[:\-])\s*([a-zA-Z][a-zA-Z .,'-]{2,50})/i

function cleanValue(
  value: string,
): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[.!,?]+$/g, "")
    .trim()
}

export function extractMemoryFacts(
  message: string,
): MemoryFactInput[] {
  const text = message.trim()
  if (!text) return []

  const lower = text.toLowerCase()
  const facts: MemoryFactInput[] = []

  for (const item of SERVICE_PATTERNS) {
    const matched = item.patterns.find(
      (pattern) =>
        lower.includes(pattern),
    )

    if (matched) {
      facts.push({
        key: item.key,
        value:
          matched
            .replace(
              "aromatherapy",
              "Aroma Therapy",
            )
            .replace(
              "aroma",
              "Aroma Therapy",
            )
            .replace(
              "deep tissue",
              "Deep Tissue Massage",
            )
            .replace(
              "swedish",
              "Swedish Massage",
            )
            .replace(
              "couple spa",
              "Couple Spa",
            )
            .replace(
              "couples spa",
              "Couple Spa",
            )
            .replace(
              "couple massage",
              "Couple Massage",
            )
            .replace(
              "thai massage",
              "Thai Massage",
            )
            .replace(
              "balinese",
              "Balinese Massage",
            )
            .replace(
              "hot stone",
              "Hot Stone Therapy",
            )
            .replace(
              "body scrub",
              "Body Scrub",
            )
            .replace(
              "body wrap",
              "Body Wrap",
            )
            .replace(
              "four hand",
              "Four Hand Massage",
            ),
        valueType: "text",
        source: "customer",
        confidence: 0.92,
      })
      break
    }
  }

  const locationMatch =
    text.match(LOCATION_PATTERN)

  if (locationMatch) {
    const value =
      cleanValue(
        locationMatch[2] ||
          locationMatch[1] ||
          "",
      )

    if (value.length >= 3) {
      facts.push({
        key: "customer_location",
        value,
        valueType: "text",
        source: "customer",
        confidence: 0.82,
      })
    }
  }

  return facts
}

export function formatCustomerMemoryContext(
  memories: CustomerMemory[],
): string {
  if (!memories.length) {
    return "No saved customer memory."
  }

  return memories
    .slice(0, 20)
    .map(
      (memory) =>
        `- ${memory.memory_key}: ${memory.memory_value}`,
    )
    .join("\n")
}

export async function getCustomerMemories(
  accountId: string,
  contactId: string,
): Promise<CustomerMemory[]> {
  const { data, error } = await supabaseAdmin()
    .from("customer_memories")
    .select("*")
    .eq("account_id", accountId)
    .eq("contact_id", contactId)
    .order("last_seen_at", {
      ascending: false,
    })
    .limit(50)

  if (error) {
    throw new Error(
      `Failed to load customer memory: ${error.message}`,
    )
  }

  return (data ?? []) as CustomerMemory[]
}

export async function upsertCustomerMemoryFacts(
  accountId: string,
  contactId: string,
  facts: MemoryFactInput[],
): Promise<void> {
  if (!facts.length) return

  const rows = facts.map((fact) => ({
    account_id: accountId,
    contact_id: contactId,
    memory_key: fact.key,
    memory_value: fact.value,
    value_type:
      fact.valueType ?? "text",
    source:
      fact.source ?? "system",
    confidence:
      Math.max(
        0,
        Math.min(
          1,
          fact.confidence ?? 1,
        ),
      ),
    metadata:
      fact.metadata ?? {},
  }))

  const { error } = await supabaseAdmin()
    .from("customer_memories")
    .upsert(
      rows,
      {
        onConflict:
          "account_id,contact_id,memory_key",
      },
    )

  if (error) {
    throw new Error(
      `Failed to save customer memory: ${error.message}`,
    )
  }
}

export async function saveCustomerMemory(
  accountId: string,
  contactId: string,
  fact: MemoryFactInput,
): Promise<CustomerMemory> {
  const { data, error } =
    await supabaseAdmin()
      .from("customer_memories")
      .upsert(
        {
          account_id: accountId,
          contact_id: contactId,
          memory_key: fact.key,
          memory_value: fact.value,
          value_type:
            fact.valueType ?? "text",
          source:
            fact.source ?? "agent",
          confidence:
            Math.max(
              0,
              Math.min(
                1,
                fact.confidence ?? 1,
              ),
            ),
          metadata:
            fact.metadata ?? {},
        },
        {
          onConflict:
            "account_id,contact_id,memory_key",
        },
      )
      .select("*")
      .single()

  if (error || !data) {
    throw new Error(
      error?.message ??
        "Failed to save customer memory",
    )
  }

  return data as CustomerMemory
}

export async function deleteCustomerMemory(
  accountId: string,
  contactId: string,
  memoryId: string,
): Promise<void> {
  const { error } =
    await supabaseAdmin()
      .from("customer_memories")
      .delete()
      .eq("id", memoryId)
      .eq("account_id", accountId)
      .eq("contact_id", contactId)

  if (error) {
    throw new Error(
      `Failed to delete customer memory: ${error.message}`,
    )
  }
}
