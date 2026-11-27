import type { AIIntent } from './types';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { AI_TAGS } from './constants';
import { runAutomationsForTrigger } from '@/lib/automations/engine';

async function createTask(
  db: ReturnType<typeof supabaseAdmin>,
  args: {
    accountId: string;
    userId: string;
    contactId: string;
    conversationId: string;
    title: string;
    priority: 'low' | 'medium' | 'high';
    description?: string;
  }
) {
  const { data: existingTask } = await db
    .from('tasks')
    .select('id')
    .eq('account_id', args.accountId)
    .eq('contact_id', args.contactId)
    .eq('title', args.title)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingTask) {
    return;
  }

  await db.from('tasks').insert({
    account_id: args.accountId,
    created_by: args.userId,
    contact_id: args.contactId,
    conversation_id: args.conversationId,
    title: args.title,
    description: args.description ?? null,
    priority: args.priority,
    status: 'pending',
  });
}

interface ProcessAIIntentArgs {
  intent: AIIntent;
  contactId: string;
  conversationId: string;
  accountId: string;
  userId: string;
}

async function attachTag(
  db: ReturnType<typeof supabaseAdmin>,
  args: ProcessAIIntentArgs,
  tagId: string
) {
  const { data: tag } = await db
    .from('tags')
    .select('id')
    .eq('id', tagId)
    .eq('account_id', args.accountId)
    .maybeSingle();
  if (!tag) return false;
  const { error } = await db.from('contact_tags').upsert({
    contact_id: args.contactId,
    tag_id: tag.id,
  });
  return !error;
}

export async function processAIIntent(args: ProcessAIIntentArgs) {
  const db = supabaseAdmin();

  try {
    switch (args.intent) {
      case 'PRICE_QUERY':
        const attachedHOT_LEAD = await attachTag(db, args, AI_TAGS.HOT_LEAD);

        if (attachedHOT_LEAD)
          await runAutomationsForTrigger({
            accountId: args.accountId,
            triggerType: 'tag_added',
            contactId: args.contactId,
            context: {
              tag_id: AI_TAGS.HOT_LEAD,
            },
          });

        await createTask(db, {
          accountId: args.accountId,
          userId: args.userId,
          contactId: args.contactId,
          conversationId: args.conversationId,
          title: 'Hot Lead Follow Up',
          priority: 'high',
          description:
            'Customer asked for pricing. High buying intent detected.',
        });

        break;

      case 'BOOK_APPOINTMENT':
        await createTask(db, {
          accountId: args.accountId,
          userId: args.userId,
          contactId: args.contactId,
          conversationId: args.conversationId,
          title: 'Confirm Spa Appointment',
          priority: 'high',
          description:
            'AI detected appointment booking intent. Contact customer and confirm appointment.',
        });

        break;

      case 'MEMBERSHIP_QUERY':
        const attachedMEMBERSHIP = await attachTag(
          db,
          args,
          AI_TAGS.MEMBERSHIP
        );

        if (attachedMEMBERSHIP)
          await runAutomationsForTrigger({
            accountId: args.accountId,
            triggerType: 'tag_added',
            contactId: args.contactId,
            context: {
              tag_id: AI_TAGS.MEMBERSHIP,
            },
          });

        await createTask(db, {
          accountId: args.accountId,
          userId: args.userId,
          contactId: args.contactId,
          conversationId: args.conversationId,
          title: 'Membership Interested Lead',
          priority: 'high',
          description: 'Customer asked about membership plans.',
        });
        break;

      case 'FOLLOWUP_REQUEST':
        await attachTag(db, args, AI_TAGS.FOLLOWUP_LEAD);

        await createTask(db, {
          accountId: args.accountId,
          userId: args.userId,
          contactId: args.contactId,
          conversationId: args.conversationId,
          title: 'Follow Up Lead',
          priority: 'medium',
          description: 'Customer requested callback or follow-up.',
        });

        break;

      case 'HUMAN_SUPPORT':
        await createTask(db, {
          accountId: args.accountId,
          userId: args.userId,
          contactId: args.contactId,
          conversationId: args.conversationId,
          title: 'Human Support Requested',
          priority: 'high',
          description: 'Customer requested human support.',
        });
        break;

      case 'REFUND_REQUEST':
        await createTask(db, {
          accountId: args.accountId,
          userId: args.userId,
          contactId: args.contactId,
          conversationId: args.conversationId,
          title: 'Refund Request',
          priority: 'high',
          description: 'Customer requested refund.',
        });
        break;

      case 'THERAPIST_PHOTO_REQUEST':
        await createTask(db, {
          accountId: args.accountId,
          userId: args.userId,
          contactId: args.contactId,
          conversationId: args.conversationId,
          title: 'Therapist Photo Request',
          priority: 'medium',
          description: 'Customer requested therapist photos.',
        });
        break;

      default:
        break;
    }
  } catch {
    throw new Error('AI CRM action failed');
  }
}
