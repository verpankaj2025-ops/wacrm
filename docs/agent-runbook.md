# Relaxio CRM agent runbook

## Starting a task

Open the `relaxio-crm` branch of `verpankaj2025-ops/wacrm` in Codex and state the desired outcome in one line. For example, “Verify login and Existing deals on Preview.” The agent loads `AGENTS.md`, this runbook and `plan.md` at task start. For a mentioned error or prior blocked check, establish its current state before proposing a fix.

Routine diagnostics, approved code work, tests and reversible retries are part of the task. Follow the scope in `AGENTS.md`. Use `plan.md` to carry module status and pending checks across sessions. Store stable repository facts here, with provider IDs where useful. Record only verified outcomes. Keep credentials, customer data, account identifiers and full callback URLs out of documentation.

These instructions are read when an agent works in the repository. Scheduled or unattended monitoring requires its own explicitly requested automation.

## Choose tools from the task

| Trigger | Tool and outcome |
| --- | --- |
| Branch, diff, commit, PR or CI work | GitHub. Verify the repository and ref, preserve unrelated work, and verify the remote result after an authorized write. |
| API or dependency change | Context7, then official docs where needed. Check the installed version’s docs for Next.js behavior. |
| Auth, database, schema or migration issue | Supabase. Confirm the project ref, inspect sanitized Auth logs and schema first, and use versioned migrations on approved compatible targets. |
| Browser regression or Preview check | Playwright or the connected browser. Verify the visible outcome. Use synthetic fixtures for local tests and secure browser authentication for live sign-in. |
| Defensive review of auth, RLS, webhook or secret handling | Semgrep when connected, plus code and policy review. Validate findings against the changed code. |
| Build failure, hosting configuration or rollout | Vercel. Inspect the active deployment, runtime logs and env names. If the user requests a deployment or a live Preview fix, deploy the intended ref to Preview and verify the new deployment. |

Select tools based on the task. If a connected tool lacks access, use a safe supported fallback and report the specific blocker only if it remains.

## Known environments

| Context | Target |
| --- | --- |
| GitHub | `verpankaj2025-ops/wacrm`, branch `relaxio-crm`. The original wacrm app is on `main`. |
| Existing deals | Supabase project `wacrm` (ref `djaagfpjugyxkoqewpad`). Legacy tables use `accounts` and `account_id`. The Relaxio legacy deals view is read-only and uses the signed-in account’s RLS. |
| Hosted test | Vercel project `relaxio-crm-preview`, Preview environment, `RELAXIO_DATA_MODE=wacrm`. Resolve the latest ready deployment in Vercel before sharing its URL. |
| Native Relaxio | Use the organization-based migrations on an approved compatible database. The legacy schema is incompatible. |

## Resolve a hosted login issue

1. Verify the user is on the latest ready Preview and record which form failed: Sign in, Create account or OAuth.
2. Check the deployment commit, Preview env names and the matching Vercel request log. Expected settings include `APP_URL`, `RELAXIO_DATA_MODE`, both public Supabase values, and both Redis REST values. The app supports `UPSTASH_REDIS_REST_*` and Vercel-managed `KV_REST_API_*`. Never print values that are secret. If a config change is authorized, redeploy and confirm it reached the new Preview.
3. Inspect sanitized Auth logs and provider availability. The existing wacrm account is the one that carries deal access. A duplicate signup and an invalid password are distinct. Use password recovery or secure browser authentication when the user must act. Never ask for secrets in chat.
4. Verify the actual success condition. A rendered login form only proves the page loaded. For a signed-in deals check, confirm the Existing deals page renders and the account’s allowed records are visible. If a live account is unavailable, report the checks completed and the exact remaining step.

## Finish a task

Run the checks appropriate to the diff and review the result. Update `plan.md` when module progress changes. If publication is requested, verify the published branch or deployment. Report what changed, what passed, and what still needs credentials, approval or a different environment.
