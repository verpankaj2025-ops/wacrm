# Relaxio CRM: agent instructions

## Project
Relaxio CRM is a multi-tenant, WhatsApp-first CRM SaaS (original code and UI; the MIT wacrm repo is a study reference only; keep its MIT notice on any borrowed code).
Source of truth: `docs/spec.md` (requirements) and `plan.md` (module checklist and status). Read both at the start of every task.

## Stack
Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Supabase (Postgres, Auth, RLS, Storage, Realtime), Upstash Redis, Meta WhatsApp Cloud API, Stripe (or Razorpay, undecided), Sentry.
Design: sage #A8C6AD, deep green #245647 (text and actions), cream #FAF8F2. Instrument Serif headings, DM Sans body. Dark mode, accessible contrast.
Next.js may differ from your training data. Check current docs via Context7 (or node_modules/next/dist/docs/) before writing any API code.

## Commands (verify names in package.json before use)
- Lint: `npm run lint`
- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`
- Unit and policy tests: `npx vitest run`
- Browser flows: `npx playwright test`

## Security rules (always)
- Every app-owned table has a non-null `org_id` and RLS enabled in its creation migration.
- Link tenant data with composite same-org foreign keys.
- The server resolves membership from the authenticated session. Never trust a client-sent org_id, route param or id.
- Service-role code (webhooks, jobs) bypasses RLS: scope every query by org_id explicitly and add a cross-org test.
- Validate all input with Zod. Rate-limit public endpoints. Verify webhook signatures on the raw body.
- Secrets live only in environment variables. Never commit `.env.local`; keep `.env.local.example` with names only.
- Never log or send to Sentry: phone numbers, names, message content, tokens, credentials.
- WhatsApp: enforce the 24-hour service window server-side, track opt-in and opt-out, encrypt tokens with AES-256-GCM.
- Neutralize CSV cells starting with = + - @.

## Decisions
- Job runner: [choose before Module 6: Supabase pg_cron / Vercel Cron / Upstash QStash]
- Payments: [Stripe or Razorpay, decide before Module 9]

## Workflow: autopilot
- On "go": read plan.md, take the first unchecked module and run it end to end:
  migrations + RLS -> tests -> code -> lint, typecheck, build, Vitest, policy tests, relevant Playwright flows -> update plan.md -> one git commit -> short summary.
- After a low-risk module passes every check, continue to the next module without waiting.
- STOP and report (never skip, mock or guess) when:
  1. a check fails and cannot be fixed within the module
  2. a credential, external account or decision is missing
  3. a high-risk module is finished: WhatsApp, Billing, Hardening (wait for my review)
  4. a step needs an auth configuration change, dropping tables, or touching production
- Record blocked checks at the top of plan.md instead of asking me each time.
- Minimal diffs. No placeholders or fake data in production code. Do not claim a check passed unless you ran it.
- Summaries stay short: what was built, which checks passed, which are blocked.
