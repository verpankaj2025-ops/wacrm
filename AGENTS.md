<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Relaxio CRM standing instructions

- Read plan.md and the relevant repository instructions at the start of a task. Carry out routine edits, local setup, retries, and verification for the authorized task without asking for step-by-step approval. Wait for explicit approval before starting the next module.
- On setup errors, identify the checkout and running host first. Verify required .env.local variable names without exposing values. Preserve existing settings, keep credentials in ignored environment files, and distinguish workspace changes from changes on the user's machine.
- Use connected GitHub and Supabase tools when relevant. Treat wacrm as the confirmed dev connection for the current setup. It contains an existing CRM schema. Inspect it read-only and ask before any migration or data change there. Ask before changing auth configuration, dropping tables, or touching production.
- Run relevant repository checks after changes. Report actual results and pending provider checks. Keep plan.md current and commit verified changes when requested.
