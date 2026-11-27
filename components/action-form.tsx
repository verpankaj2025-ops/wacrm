'use client';

import { useActionState, type ReactNode } from 'react';
import { Button } from './ui/button';
type ActionResult = { status?: string; report?: string; error?: string };

export function ActionForm({ action, org, children, label }: {
  action: (previous: ActionResult, form: FormData) => Promise<ActionResult>;
  org: string;
  children: ReactNode;
  label: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return <form action={submit} className="stack">
    <input type="hidden" name="workspace" value={org} />
    {children}
    <Button disabled={pending}>{pending ? 'Saving…' : label}</Button>
    {state.error && <p className="notice" role="alert">{state.error}</p>}
    {state.status && <p className="notice" role="status">{state.status}</p>}
    {state.report && <a download="rejected-contacts.csv" href={'data:text/csv;charset=utf-8,' + encodeURIComponent(state.report)}>Download rejected rows</a>}
  </form>;
}
