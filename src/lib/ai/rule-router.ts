import type { AIResponse } from "./types";

export function getRuleBasedReply(
message: string,
): AIResponse | null {

const msg = message.toLowerCase();

// Pricing

if (
msg.includes("price") ||
msg.includes("cost") ||
msg.includes("charges") ||
msg.includes("rate")
) {
return {
reply:
"Pricing service aur therapist preference ke according hoti hai 😊 Aap kis service me interested hain?",
intent: "PRICE_QUERY",
confidence: 95,
handoff: false,
};
}

// Offer / Discount

if (
msg.includes("offer") ||
msg.includes("discount") ||
msg.includes("deal") ||
msg.includes("coupon")
) {
return {
reply:
"Current offers availability ke hisab se rehti hain 😊 Aap kis service ke liye inquiry kar rahe hain?",
intent: "PRICE_QUERY",
confidence: 95,
handoff: false,
};
}

// Location

if (
msg.includes("location") ||
msg.includes("address") ||
msg.includes("where")
) {
return {
reply:
"Hamari spa branch Gomti Nagar me Patrakarpuram Chauraha ke paas hai 😊 Agar location chahiye to main Google Maps link share kar sakta hoon.",
intent: "GENERAL_CHAT",
confidence: 95,
handoff: false,
};
}

// Map

if (
msg.includes("map") ||
msg.includes("google map")
) {
return {
reply:
"Yeh hamari Google Maps location hai 😊 https://maps.app.goo.gl/9oPBpap3J5PqabsU6",
intent: "GENERAL_CHAT",
confidence: 95,
handoff: false,
};
}

// Timing

if (
msg.includes("timing") ||
msg.includes("open") ||
msg.includes("close")
) {
return {
reply:
"Hum daily 11 AM se 8 PM tak available hain 😊 Aap kis date par visit karna chahenge?",
intent: "BOOK_APPOINTMENT",
confidence: 95,
handoff: false,
};
}

// Couple Spa

if (
msg.includes("couple")
) {
return {
reply:
"Couple Spa hamari popular services me se ek hai ❤️ Aap kis date ke liye booking karna chahenge?",
intent: "BOOK_APPOINTMENT",
confidence: 95,
handoff: false,
};
}

// Therapist Preference

if (
msg.includes("thai therapist") ||
msg.includes("nepali therapist") ||
msg.includes("indian therapist") ||
msg.includes("female therapist")
) {
return {
reply:
"Availability date aur slot ke hisab se check ki jati hai 😊 Aap kis date par visit karna chahenge?",
intent: "BOOK_APPOINTMENT",
confidence: 95,
handoff: false,
};
}

// Massage Services

if (
msg.includes("thai") ||
msg.includes("swedish") ||
msg.includes("balinese") ||
msg.includes("aroma") ||
msg.includes("deep tissue") ||
msg.includes("massage")
) {
return {
reply:
"Excellent choice 😊 Aap kis date par appointment book karna chahenge?",
intent: "BOOK_APPOINTMENT",
confidence: 95,
handoff: false,
};
}

// Booking

if (
msg.includes("book") ||
msg.includes("booking") ||
msg.includes("appointment")
) {
return {
reply:
"Bilkul 😊 Aap kis date ke liye appointment book karna chahenge?",
intent: "BOOK_APPOINTMENT",
confidence: 95,
handoff: false,
};
}

return null;
}
