# Relaxio CRM

Relaxio CRM is a WhatsApp-first CRM. This release contains organization onboarding and identity management.

## Run locally

1. Install dependencies with `npm ci`.
2. Copy `.env.local.example` to `.env.local`. Set the origin of the app, the dedicated development Supabase URL and keys, and the Upstash Redis REST credentials. Keep the service role key server-side. The app's auth actions fail closed when Redis is unavailable.
3. Apply the migration under `supabase/migrations` to the dedicated development database.
4. With approval to configure the development Auth project, enable verified email signup and Google OAuth, register its Supabase Google callback, add the app's `/auth/callback` URL to Supabase's redirect allowlist, and set the site URL. The default email confirmation template uses PKCE and requires the original browser. For cross-device confirmation, Supabase can use `/auth/confirm` with a token hash. Set the email template only after approving the Auth configuration change.
5. Run `npm run dev -- --port 3100` and open the app on the origin in `APP_URL`.

The invite creator copies the link and shares it with the intended teammate. Invite redemption requires the matching verified email. The application rate-limits it to eight attempts per user per ten minutes and the database exposes redemption only to the server role.

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:e2e`. Playwright uses its installed Chromium by default. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing binary. The default browser tests cover public onboarding. Policy tests apply the migration to embedded PostgreSQL with a test Auth schema. Provider verification requires dedicated development Supabase and Upstash credentials.

To exercise signup, login, org creation, invitation acceptance and concurrent redemption against your dedicated local stack, export the variables from your test environment and run `RELAXIO_LOCAL_PROVIDER_TEST=1 npm run test:e2e`. The suite requires email confirmations on and uses the local Auth admin API to confirm its disposable test account. It does not initiate Google sign-in. Google OAuth requires a separate browser check with a configured Google test client.

## Tenant data, Storage and Realtime

Use composite foreign keys of the form `(org_id, related_id)` against tenant-owned rows with matching keys. The audit-to-invitation constraint follows this pattern. RLS checks the authenticated user's current membership through the private role helper.

Use `organizationFilesBucket` and `organizationFilePath` from `lib/tenant.ts` with the session-bound Supabase client. Members can read files. Owners, admins and agents can write in their own namespace. The private bucket expects objects under `<org-id>/<path>`.

Use `organizationBroadcastChannel` for private, receive-only organization Broadcast channels. Publish organization events privately from a trusted server and send invalidations with no sensitive data. Subscribers should refetch protected data through RLS. Supabase caches subscription authorization, so an existing channel may retain receive permission until a JWT refresh or reconnect. Live verification on an approved dev stack should test Storage HTTP access and private Broadcast joins and delivery with separate A and B sessions.

## Contacts and leads

Open **Contacts and leads** from the active organization. Owners, admins and agents can add or edit contacts, attach tags, manage custom field values and import CSV. Viewers can browse the directory and contact details. Each organization can define up to 20 custom fields using text, number, yes/no or date types.

Upload a UTF-8 CSV with `name,phone` or `name,phone,kind` headers and up to 500 data records or 256 KiB. Use `contact` or `lead` in the optional kind column. Local phone numbers default to India. Imports skip phones that already exist in the selected organization and leave those contacts' details intact. Rejected-row downloads contain CSV record numbers and validation reasons only. The contacts code returns generic server errors and does not capture contact names or phone numbers in app logs or Sentry.

## Pipeline

Open **Pipeline** from the active organization. Add a stage with a position to control its column order, then create a deal with a contact, stage and amount in INR. Use the stage selector on a deal to move it. The server checks the active organization, role and destination, and rejects a move if the deal has left the source stage. Viewers can browse the board. To create a deal for a contact outside the first 100 options, open the contact's directory entry and select **Create a deal for this contact**.

When WhatsApp introduces conversations, add the optional conversation link using a composite foreign key keyed by `(org_id, conversation_id)`.

## WhatsApp inbox

Use the dev Meta app's secret and a separate webhook verification token. Configure a supported Graph version and a 32-byte hex token key in ignored `.env.local`. Retain old key versions during rotation and resave each channel to encrypt it with the active key. An owner or admin can register a Meta phone-number ID, WABA ID and access token in **WhatsApp inbox**. Use only channel IDs belonging to the selected organization. The Meta token needs message-send and template-read access.

Point Meta at `/api/whatsapp/webhook` and subscribe to the messages webhook field. The callback validates the raw signature and acknowledges after the scoped database transaction commits. Provider retries cover transient database failures. Redis deduplication is best effort and the database key also protects against replay. Set reverse proxy and hosting access logs to omit webhook query strings, request bodies and authorization headers. The verify token is transmitted in Meta's GET query string.

Record WhatsApp opt-in only after explicit consent. STOP records an opt-out. Free text requires both consent and an open 24-hour service window. Outside that window, the inbox checks the named template and language against Meta before sending. This module supports approved static templates without parameters. An unconfirmed outbound result is not automatically retried, because Meta can accept a request before the app receives or stores its response.

Live verification requires the development project, Upstash and Meta test assets. Check GET verification, signed inbound and duplicate delivery, approved template sends, status webhooks and STOP enforcement with the dev number.

## Automations

Owners and admins can build per-organization workflows under **Automations**. Choose inbound, keyword, new contact or recurring schedule. Add up to ten ordered steps with optional conditions. A false condition skips that step. Tag actions require a contact. WhatsApp actions require a conversation, current opt-in and a Meta-approved static template. Schedule triggers may select a conversation. Pausing a workflow prevents new runs and new claims, and resuming can release queued work. Existing runs keep the steps saved when they were triggered.

The runner uses a durable PostgreSQL queue. Configure your dev scheduler to POST to `/api/automations/run` every minute with `Authorization: Bearer <AUTOMATION_RUNNER_SECRET>`. Set a random secret of at least 32 characters in the app environment and the scheduler's secret store. Use a single schedule for the app. Each invocation processes up to ten steps, subject to its time budget. View run state in the workspace. Pending waits resume when due on a later tick. Transient internal errors get bounded retries. Delivery attempts with an uncertain outcome are failed for review to avoid duplicate external effects.

For the optional webhook action, set `AUTOMATION_WEBHOOK_URL` to a trusted operator-managed HTTPS receiver. All workflows use this destination. Delivery carries a run ID, trigger kind and step number with an idempotency key. It omits contact and message content. The worker does not follow redirects.
