import { z } from 'zod';

export const roles = ['owner', 'admin', 'agent', 'viewer'] as const;
export type Role = (typeof roles)[number];
export const invitedRoles = ['admin', 'agent', 'viewer'] as const;
export const uuid = z.uuid();
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const token = z.string().regex(/^[a-f0-9]{64}$/);
export const loginInput = z.object({ email, password: z.string().min(1).max(72) });
export const signupInput = loginInput.extend({ password: z.string().min(12).max(72)
  .refine(value => new TextEncoder().encode(value).length <= 72) });
export const orgName = z.string().trim().min(2).max(80);
export const inviteInput = z.object({ org: uuid, email, role: z.enum(invitedRoles) });
export const memberChange = z.object({ org: uuid, user: uuid, role: z.enum([...roles, 'remove']) });
export function safeDestination(value: unknown): string {
  return typeof value === 'string' && /^\/join\/[a-f0-9]{64}$/.test(value)
    ? value : '/organizations';
}
