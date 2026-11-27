<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Task entry point

A short task request is enough. Read [the agent runbook](docs/agent-runbook.md) at the start and use its plugin routing, environment map and verification steps. Resume known work from `plan.md` without asking the user to repeat context. Recheck changing provider state live.

## Repository and environments

- Use `verpankaj2025-ops/wacrm` on branch `relaxio-crm` for this app. The `main` branch is the original wacrm app. Check the checkout, branch, working tree and target environment before editing. Preserve unrelated work.
- Read `plan.md`, `docs/spec.md`, and any closer `AGENTS.md` before implementation. Work on the requested module or bug. Wait for the user's go-ahead before starting the next module.
- The existing Supabase `wacrm` project (ref `djaagfpjugyxkoqewpad`) uses the legacy `accounts` schema. It contains existing deals. In `RELAXIO_DATA_MODE=wacrm`, use the session-bound Supabase client and existing RLS for the read-only deals view. Never use a service role to make hidden deals appear. Preserve original currency and optional relationships.
- The native Relaxio app uses its own organization-scoped schema and ordered migrations in `supabase/migrations`. Apply those migrations only to the explicitly approved compatible target. Ask before changing Auth settings, writing to the legacy project, dropping tables, deploying to production or rolling out a breaking data change.

## Work sequence

1. Identify the user-visible outcome, target branch and environment. For a bug, reproduce it or capture reliable evidence of the failure. Use an isolated checkout when the current working tree has unrelated edits.
2. Use Context7 for the current API contract before changing a library, route or provider integration. Check official vendor docs where Context7 lacks coverage. For Next.js, also read the installed version's relevant guide in `node_modules/next/dist/docs/`.
3. For schema changes, inspect the target's existing schema and migration history first, then write migrations and RLS, add policy and regression tests, and implement application code. Use the authenticated user session for normal data access. Validate input, enforce roles and scope server-side, and use same-organization composite foreign keys where tenant records link together.
4. Carry out authorized edits, checks and safe retries without asking for routine confirmation. Keep changes scoped. When blocked, report the exact missing access, credentials, environment or decision, and finish the checks that can run independently.
5. Verify with `npm run lint`, `npm run typecheck`, and related `npm test` cases. Run `npm run build` for application changes and relevant `npm run test:e2e` flows for user-facing changes. Distinguish fixture tests from checks against real providers. Document actual pass, failure and skip results in `plan.md` when module status changes.
6. Review the diff and staged files. When asked to publish, use the GitHub connection or authenticated Git, target the active branch, and verify the resulting remote ref. Ask before a force-push or merge to `main`. Summarize the change, verification, pending checks and commit or PR when available.

## Which plugin to use

Use the relevant connected tool when it has access. If it is unavailable, use the appropriate local CLI or approved browser workflow and state any remaining limitation.

| Plugin or tool | Use it for |
| --- | --- |
| GitHub | Repository and branch checks, remote diffs, commits, PRs and CI status. Verify the target before writing. |
| Context7 | Current docs for Next.js, Supabase, Upstash, Meta WhatsApp and other integration APIs. Resolve the library first. Keep project secrets and customer data out of queries. |
| Supabase | Project identification, database and Auth diagnostics, read-only logs, schema and migration inspection, and approved migrations. Confirm the exact project ref and environment before writes. |
| Browser testing / Playwright | Reproduce user-visible failures and verify routes, forms and regression flows. Use synthetic data for fixtures and an approved test account for live checks. |
| Semgrep, when connected | Defensive review of auth, tenant access, secrets handling and webhook changes. Triage findings against the diff before editing. |
| Vercel, when connected | Inspect the approved project's deployment, build logs and environment variable names. Keep secrets out of output. Apply hosting changes only within the authorized scope. |

## Setup and login triage

- Confirm whether the server runs in Codex or on the user's Mac. A GitHub or Supabase connection gives remote service access. A Mac checkout still needs to pull code and restart its local server. For a handoff, give one copy-paste block and the exact URL to check.
- Keep credentials in ignored `.env.local` or approved secret storage. Compare variable names against `.env.local.example` and report only whether required values are set. Never print, commit or request passwords, reset links, OAuth client secrets or service-role keys in chat.
- Diagnose login in order: confirm the running checkout and project URL, check provider availability, then inspect sanitized Auth error codes and confirm the intended existing account. Check RLS and schema only after authentication succeeds. In legacy mode, use the existing wacrm email/password account for deal access. Treat signup, password sign-in and OAuth as separate flows.
- For Supabase or WhatsApp failures, start with read-only diagnostics. Keep personal data, message content, credentials and full callback query strings out of logs and summaries.
