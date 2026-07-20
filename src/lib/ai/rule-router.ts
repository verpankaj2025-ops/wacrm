import type { AIResponse } from "./types";

export function getRuleBasedReply(
  message: string,
): AIResponse | null {

  const msg = message.toLowerCase().trim();

  // ==========================
  // Google Maps
  // ==========================

  if (
    msg === "map" ||
    msg.includes("google map") ||
    msg.includes("location map")
  ) {
    return {
      reply:
        "📍 Google Maps:\nhttps://maps.app.goo.gl/9oPBpap3J5PqabsU6",
      intent: "GENERAL_CHAT",
      confidence: 100,
      handoff: false,
    };
  }

  // ==========================
  // Address
  // ==========================

  if (
    msg === "address" ||
    msg === "location"
  ) {
    return {
      reply:
        "Relaxio Spa\nPatrakarpuram, Gomti Nagar, Lucknow 😊",
      intent: "GENERAL_CHAT",
      confidence: 100,
      handoff: false,
    };
  }

  // ==========================
  // Timing
  // ==========================

  if (
    msg === "timing" ||
    msg === "open" ||
    msg === "closing time"
  ) {
    return {
      reply:
        "🕚 Hum daily 11:00 AM se 8:00 PM tak open rehte hain.",
      intent: "GENERAL_CHAT",
      confidence: 100,
      handoff: false,
    };
  }

  return null;
}