# Relaxio CRM implementation plan

**Module 1: complete locally; provider verification pending.** **Module 2: complete locally; provider verification pending.** **Module 3: complete locally.** **Module 4: complete locally.** **Module 5: complete locally; provider verification pending.** **Module 6: complete locally; dev scheduler verification pending.** Module 7 awaits your “go”.

## Pending provider checks

- [ ] Verify Google OAuth end to end on the development stack.
- [ ] Run the opt-in Supabase and Upstash onboarding test on the development stack. Verify signup, login, organization creation, copied-link acceptance and exactly one successful concurrent redemption.

- [ ] Verify Module 2 on the development stack with separate organization A and B sessions. Exercise private Storage HTTP access and private Realtime Broadcast joins and delivery.

- [ ] Verify Module 5 with the dev Supabase, Upstash and Meta test number. Apply the migration, register the channel and check webhook handshake, signed inbound delivery and replay, approved-template and in-window sends, STOP, and Meta delivery/read receipts. This checkout had no Relaxio CRM .env.local.

- [ ] Apply Module 6 on dev, configure the minute-based scheduler, and verify a scheduled run, resumed wait, and test-provider deliveries.

## Module checklist

Read this file at the start of each task. Execute only the first unchecked module, then update its status and summarize verification. Review current Context7 documentation before changing any API. Within each module, write migrations and RLS first, then tests, then application code. Run lint, typecheck, related Vitest tests, relevant Playwright flows and applicable database policy tests before marking a module complete. Record external checks that remain blocked. Ask before changing auth configuration, dropping tables or touching production.

1. [x] **Auth and organizations.** Set up the new app and initial organization, membership, invitation and audit migrations with RLS. Use fixed-search-path org creation and a private membership helper. Deliver copyable links and rate-limit redemption. Write local policy, Vitest and Playwright tests. Implement signup, login, Google OAuth, organization creation and switching, invitation links and role enforcement.
   - Passed lint, typecheck, four Vitest tests and two local Playwright tests. The production build passed during implementation. A PostgreSQL catalog query on the migrated test database confirmed RLS on all four public tables. Provider checks are tracked above.
2. [x] **Multi-tenant schema.** Harden shared tenant constraints and membership policies. Set up tenant-scoped Storage and Realtime and test isolation with separate organizations.
   - Added private Storage paths and receive-only Realtime topics. A composite foreign key enforces tenant ownership for audit links to invitations. Lint, typecheck and all seven Vitest cases passed, including A/B policy checks on migrated embedded PostgreSQL.
3. [x] **Contacts and leads.** Add contacts, tags and custom field schema and RLS. Test CSV validation and normalized phone deduplication. Implement management and import.
   - Added contacts, leads, tags and up to 20 typed fields, with RLS and same-org foreign keys. CSV imports normalize to E.164 with India as the default and skip existing phones. Lint, typecheck, production build, 11 Vitest tests and three local Playwright flows passed. Database policies were exercised on embedded PostgreSQL and the CSV browser flow used a local Supabase API fixture.
4. [x] **Pipeline.** Add stages and deals with same-org relationships. Test stage updates and implement Kanban. Add the optional same-org conversation link in Module 5 when the conversations table exists.
   - Added a Kanban board with deal and stage creation and role-checked stage moves. Composite foreign keys reject cross-org contacts and stages. Lint, typecheck, production build, 15 Vitest tests including embedded PostgreSQL policy tests, and four local Playwright flows passed. The Pipeline browser flow used a local Supabase API fixture.
5. [x] **WhatsApp.** Add integration, conversation, message and notes schema with RLS. Test verification, replay handling, delivery updates and encryption. Implement the webhook, Upstash dedupe, sending and the mobile inbox. Enforce the 24-hour window, approved template fallback and opt-in/opt-out tracking.
   - Added signed, tenant-scoped webhook processing, Redis and database deduplication, encrypted Meta tokens, the responsive inbox and optional same-org deal conversation links. Lint, typecheck, production build, 22 Vitest cases including database policy tests, and seven local Playwright tests passed. The opt-in provider onboarding test was skipped.
6. [x] **Automations.** Implemented the ordered visual builder and persisted execution with PostgreSQL leases and a protected worker endpoint. The worker handles inbound, keyword, new-contact and recurring schedule triggers, with conditional tags, approved templates, webhooks and waits. Lint, typecheck, build, 25 Vitest cases including policy tests, and nine local Playwright tests passed. Provider verification is tracked above.
7. [ ] **Broadcasts.** Add campaign, template and recipient state. Test variable validation, idempotent sends and rate controls. Implement sending and delivery tracking.
8. [ ] **Dashboard.** Add tenant-scoped reporting queries and test metric definitions. Implement the activity feed and reporting views.
9. [ ] **Billing.** Add tenant subscription and usage records. Test signature verification, retries and usage enforcement. Integrate Stripe plans and billing flows.
10. [ ] **Hardening.** Review access controls, rate limits and handling of sensitive data. Verify critical end-to-end flows, Sentry configuration and /api/health.
