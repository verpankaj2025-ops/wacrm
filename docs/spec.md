# Relaxio CRM specification

Relaxio CRM is a multi-tenant SaaS for teams that manage customer relationships and sales over WhatsApp. Start with organization onboarding, then deliver the remaining modules in the order in plan.md.

## Product and design

Use an original interface and implementation. The MIT-licensed wacrm reference illustrates Supabase-backed sessions, account-scoped membership, a shared inbox and webhook-driven updates. Retain its MIT notice with any borrowed code. The existing reference checkout is for study.

The proposed starting palette is sage green (#A8C6AD), deep green (#245647) for primary text and actions, and warm cream (#FAF8F2). Use Instrument Serif for headings and DM Sans for body copy. Use rounded cards, generous spacing and soft shadows. Support dark mode, keyboard interaction and accessible contrast. Use “Relaxio CRM” for the wordmark and tagline. The inbox starts with a conversation list on small screens and opens the thread as a separate view. Wider screens can show both together.

## Architecture and tenant boundaries

Use Next.js App Router, TypeScript, Tailwind and shadcn/ui. Supabase supplies Postgres, Auth, Storage and Realtime. Upstash Redis handles rate limits and WhatsApp webhook deduplication. Integrate the Meta WhatsApp Cloud API, Stripe billing and Sentry in their respective phases. Build the automation editor and execution engine in-house. Configure Sentry to avoid sending personal information, message contents, tokens or credentials.

Require a non-null org_id on every app-owned table. The organizations root uses org_id as its primary key. Supabase-managed Auth tables are provider-owned. Enable RLS on every app-owned table as part of its creation migration. Store tenant-scoped file paths and enforce Storage policies. Apply the same membership boundaries to Realtime. Scope foreign keys and unique constraints by tenant where they connect tenant data. The server resolves active membership from the authenticated session and checks authorization against that membership on each request. Treat route parameters and client identifiers as untrusted. Use Zod at input boundaries, rate-limit public endpoints, and keep secrets server-side in environment configuration. Track only variable names and safe examples in .env.local.example.

## Module 1 acceptance

- Users can sign up with email and password, verify their email, sign in, use Google OAuth, and sign out. Auth callbacks validate redirect destinations.
- A verified user can create an organization and become its owner in one database transaction through a SECURITY DEFINER function with an empty search_path. A private membership helper avoids RLS recursion. The proposed workflow allows users to join multiple organizations and switch between their memberships.
- Owners and admins can invite members by link. The proposed links expire after seven days, are single-use and can be accepted only by a signed-in user with the matching verified email. Store token digests and make redemption atomic. Restrict invite permissions by target role. Deliver via a copyable link in Phase 1 and add email delivery later. Rate-limit acceptance by verified user.
- Record role, invitation and membership changes in an org-scoped audit_log.
- Owners control ownership and administrator access. Admins manage agents and viewers. Agents can perform permitted CRM operations as those modules ship. Viewers have read-only access to permitted CRM data. Prevent removing or demoting the last owner. No role can grant privileges above its authority.
- Test tenant isolation in local Supabase for permitted and denied reads/writes, cross-tenant identifiers, privilege escalation, revoked memberships and concurrent invite redemption. Use Vitest for validation and role logic, and Playwright for signup, login, organization creation and invite acceptance. Verify Google OAuth in a configured non-production environment when credentials are available.

## Later module acceptance

| Module | Completion criteria |
| --- | --- |
| Tenant schema | Establish reusable membership checks and verify isolation with same-tenant constraints, RLS, Storage and Realtime. Module 1 ships with its own complete RLS. |
| Contacts and leads | Manage tags and custom fields, validate CSV imports, report rejected rows and deduplicate normalized phone numbers within each organization. |
| Pipeline | Move deals between Kanban stages and link them to contacts and, once available, conversations in the same organization. |
| WhatsApp | Verify the raw webhook body with Meta HMAC before processing. Resolve the tenant from the registered phone-number ID. Deduplicate with Redis and enforce database uniqueness for retry recovery. Support mobile inbox, assignment, status, notes, sends, delivery/read updates and AES-256-GCM token storage. Enforce the 24-hour customer-service window with approved template fallback and track opt-in and opt-out. |
| Automations | Support inbound message, new contact, keyword and schedule triggers with conditions and tag, message, webhook and wait actions. Persist execution and resume waits safely. |
| Broadcasts | Send approved templates with validated variables and enforce rate limits. Track delivery per recipient. |
| Dashboard | Report response time, daily volume, pipeline value and activity using tenant-scoped data. |
| Billing | Map Stripe subscriptions to organizations and enforce plan limits server-side. Verify billing webhooks and handle retries idempotently. |
| Hardening | Review isolation, permissions, webhook and retry behavior. Cover critical flows, configure monitoring and ship /api/health with a minimal response. |

## Approved decisions

Approved defaults are a separate Relaxio CRM project, multiple memberships per user, email-bound invitations and the palette/type pairing above. Auth configuration changes, destructive database changes and production operations require separate approval.
