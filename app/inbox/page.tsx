import { ActionForm } from '../../components/action-form';
import { inboxAccess } from '../../lib/whatsapp/inbox';
import { connectChannel } from './actions';

export default async function Inbox() {
  const {org,role} = await inboxAccess();
  const manage = ['owner','admin'].includes(role);
  return <section className="card stack">
    {manage ? <>
      <h2>Connect a WhatsApp number</h2>
      <p>Use the phone number ID, business account ID and access token from Meta.</p>
      <ActionForm action={connectChannel} org={org.org_id} label="Save WhatsApp number">
        <label>Phone number ID<input name="number" inputMode="numeric" maxLength={32} required /></label>
        <label>WhatsApp business account ID<input name="waba" inputMode="numeric" maxLength={32} required /></label>
        <label>Access token<input type="password" name="token" autoComplete="off" maxLength={4096} required /></label>
      </ActionForm>
    </> : <p>Select a conversation to open its thread.</p>}
  </section>;
}
