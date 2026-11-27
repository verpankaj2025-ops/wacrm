export function appUrl(path: string) {
  const base = process.env.APP_URL;
  if (!base) throw new Error('APP_URL is required');
  return new URL(path, base);
}
