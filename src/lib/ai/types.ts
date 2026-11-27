export type AIIntent =
  | 'BOOK_APPOINTMENT'
  | 'PRICE_QUERY'
  | 'SERVICE_QUERY'
  | 'MEMBERSHIP_QUERY'
  | 'FOLLOWUP_REQUEST'
  | 'REFUND_REQUEST'
  | 'THERAPIST_PHOTO_REQUEST'
  | 'HUMAN_SUPPORT'
  | 'SERVICE_RECOMMENDATION'
  | 'BOOKING_CONFIRMATION'
  | 'LOCATION_QUERY'
  | 'TIMING_QUERY'
  | 'THERAPIST_QUERY'
  | 'PAYMENT_QUERY'
  | 'COMPLAINT'
  | 'GENERAL_CHAT';

export interface AIResponse {
  reply: string;
  intent: AIIntent;
  confidence: number;
  handoff: boolean;
}
