import type { AIIntent } from "./types";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { AI_TAGS } from "./constants";

async function createTask(
  db: ReturnType<typeof supabaseAdmin>,
  args: {
    accountId: string;
    userId: string;
    contactId: string;
    conversationId: string;
    title: string;
    priority: "low" | "medium" | "high";
    description?: string;
  },
) {

  const { data: existingTask } = await db
  .from("tasks")
  .select("id")
  .eq("contact_id", args.contactId)
  .eq("title", args.title)
  .eq("status", "pending")
  .maybeSingle();

if (existingTask) {
  console.log(
    "[AI TASK SKIPPED]",
    args.contactId,
    args.title,
  );
  return;
}

  await db.from("tasks").insert({
    account_id: args.accountId,
    created_by: args.userId,
    contact_id: args.contactId,
    conversation_id: args.conversationId,
    title: args.title,
    description: args.description ?? null,
    priority: args.priority,
    status: "pending",
  });
}

interface ProcessAIIntentArgs {
  intent: AIIntent;
  contactId: string;
  conversationId: string;
  accountId: string;
  userId: string;
}

export async function processAIIntent(
  args: ProcessAIIntentArgs,
) {
  const db = supabaseAdmin();

  console.log(
    "[AI CRM]",
    args.intent,
    args.contactId,
    args.conversationId,
  );

  try {
    switch (args.intent) {
      case "PRICE_QUERY":
        await db
          .from("contact_tags")
          .upsert({
            contact_id: args.contactId,
            tag_id: AI_TAGS.HOT_LEAD,
          });
        break;

      case "BOOK_APPOINTMENT":
        await db
          .from("contact_tags")
          .upsert({
            contact_id: args.contactId,
            tag_id: AI_TAGS.APPOINTMENT_BOOKED,
          });

            await createTask(db, {
    accountId: args.accountId,
    userId: args.userId,
    contactId: args.contactId,
    conversationId: args.conversationId,
    title: "Confirm Spa Appointment",
    priority: "high",
    description:
      "AI detected appointment booking intent. Contact customer and confirm appointment.",
  });

        break;

      case "MEMBERSHIP_QUERY":
        await db
          .from("contact_tags")
          .upsert({
            contact_id: args.contactId,
            tag_id: AI_TAGS.MEMBERSHIP,
          });
        break;

      case "FOLLOWUP_REQUEST":
        await db
          .from("contact_tags")
          .upsert({
            contact_id: args.contactId,
            tag_id: AI_TAGS.FOLLOWUP_LEAD,
          });

            await createTask(db, {
    accountId: args.accountId,
    userId: args.userId,
    contactId: args.contactId,
    conversationId: args.conversationId,
    title: "Follow Up Lead",
    priority: "medium",
    description:
      "AI detected follow-up request from customer.",
  });

        break;

      default:
        break;
    }
  } catch (error) {
    console.error("[AI CRM ERROR]", error);
  }
}