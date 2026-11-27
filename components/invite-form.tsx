'use client';

import { useActionState, useState } from 'react';
import { createInvitation } from '../app/actions';
import { Button } from './ui/button';

export function InviteForm({ org, owner }: { org: string; owner: boolean }) {
  const [state, action, pending] = useActionState(createInvitation, {});
  const [copied, setCopied] = useState('');
  return <>
    <form action={action} className="stack">
      <input type="hidden" name="org" value={org} />
      <label>Invitee email<input type="email" name="email" maxLength={254} required /></label>
      <label>Role<select name="role" defaultValue="agent">
        {owner && <option value="admin">Admin</option>}
        <option value="agent">Agent</option><option value="viewer">Viewer</option>
      </select></label>
      <Button disabled={pending}>{pending ? 'Creating link…' : 'Create invite link'}</Button>
    </form>
    {state.error && <p role="alert" className="notice">{state.error}</p>}
    {state.link && <div className="stack">
      <label>Invitation link<input readOnly value={state.link} onFocus={event => event.target.select()} /></label>
      <Button variant="outline" type="button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(state.link!);
          setCopied(state.link!);
        } catch {
          setCopied('');
        }
      }}>{copied === state.link ? 'Copied' : 'Copy link'}</Button>
      <p className="muted text-sm">Share this link with the invitee. It expires after seven days.</p>
    </div>}
  </>;
}
