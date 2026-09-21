export const WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS =
  24 * 60 * 60 * 1000;

export function isWithinCustomerServiceWindow(
  lastCustomerMessageAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastCustomerMessageAt) return false;

  const timestamp =
    new Date(lastCustomerMessageAt).getTime();

  if (!Number.isFinite(timestamp)) return false;

  const age = now - timestamp;

  return (
    age >= 0 &&
    age < WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS
  );
}
