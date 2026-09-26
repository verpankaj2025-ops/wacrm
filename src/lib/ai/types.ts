export type AIIntent =
  | "BOOK_APPOINTMENT"
  | "PRICE_QUERY"
  | "SERVICE_QUERY"
  | "MEMBERSHIP_QUERY"
  | "FOLLOWUP_REQUEST"
  | "REFUND_REQUEST"
  | "THERAPIST_PHOTO_REQUEST"  
  | "HUMAN_SUPPORT"
  | "GENERAL_CHAT";

export interface AIResponse {
  reply: string;
  intent: AIIntent;
  confidence: number;
  handoff: boolean;
}

export interface AIConversationMessage {
  sender_type:
    | "customer"
    | "agent"
    | "bot";
  content_text?: string | null;
  created_at?: string | null;
}

export interface AIContext {
  memoryContext?: string;
  recentMessages?: AIConversationMessage[];
  customerName?: string | null;
  leadScore?: number | null;
  leadScoreBand?: "low" | "medium" | "high" | null;
  conversationStage?: string | null;
  controlMode?: "ai" | "human" | "paused" | null;
  salesContext?: string;
}
