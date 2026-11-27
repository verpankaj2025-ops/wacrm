import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '../../../components/action-form';
import { uuid } from '../../../lib/validation';
import { inboxAccess } from '../../../lib/whatsapp/inbox';
import { addNote, recordConsent, sendMessage, updateConversation } from '../actions';

type Thread = {
  status:string; assignee_id:string|null; contact_id:string; phone_number_id:string;
  contacts:{name:string}|null;
};

export default async function ThreadPage({params,searchParams}:{
  params:Promise<{thread:string}>; searchParams:Promise<{page?:string}>;
}) {
  const parsed = uuid.safeParse((await params).thread);
  if (!parsed.success) notFound();
  const id = parsed.data;
  const {client,org,writable} = await inboxAccess();
  const orgId = org.org_id;
  const pageParam = (await searchParams).page;
  const page = typeof pageParam === 'string' && /^[1-9]\d{0,4}$/.test(pageParam) ? Number(pageParam) : 1;
  const offset = (page-1)*50;
  const [thread,messages,notes,roster] = await Promise.all([
    client.from('whatsapp_conversations').select('status,assignee_id,contact_id,phone_number_id,contacts(name)')
      .eq('org_id',orgId).eq('id',id).maybeSingle(),
    client.from('whatsapp_messages').select('message_id,direction,body,occurred_at').eq('org_id',orgId)
      .eq('conversation_id',id).order('occurred_at',{ascending:false}).order('message_id').range(offset,offset+50),
    client.from('whatsapp_notes').select('id,body,created_at').eq('org_id',orgId).eq('conversation_id',id)
      .order('created_at',{ascending:false}).limit(30),
    writable ? client.rpc('organization_roster',{p_org:orgId}) : null,
  ]);
  if (thread.error || messages.error || notes.error || roster?.error) throw new Error('Could not load the conversation.');
  if (!thread.data) notFound();
  const detail = thread.data as unknown as Thread;
  const visible = messages.data.slice(0,50);
  const outgoing = visible.filter(msg => msg.direction === 'out').map(msg => msg.message_id);
  const [consent,receipts] = await Promise.all([
    client.from('whatsapp_consent').select('opted_in,source').eq('org_id',orgId).eq('contact_id',detail.contact_id).maybeSingle(),
    outgoing.length ? client.from('whatsapp_receipts').select('message_id,status').eq('org_id',orgId)
      .eq('phone_number_id',detail.phone_number_id).in('message_id',outgoing) : null,
  ]);
  if (consent.error || receipts?.error) throw new Error('Could not load message details.');
  const statuses = new Map(receipts?.data?.map(row => [row.message_id,row.status]));
  const subject = <input type="hidden" name="thread" value={id} />;
  const members = (roster?.data ?? []) as {user_id:string;email:string|null;role:string}[];
  return <section className="card stack inbox-thread">
    <Link href="/inbox" className="inbox-back">Back to conversations</Link>
    <h2>{detail.contacts?.name ?? 'Conversation'}</h2>
    <p className="muted capitalize">{detail.status}</p>
    <ol className="stack" aria-label="Messages">{[...visible].reverse().map(msg => <li key={msg.message_id}
      className={msg.direction === 'out' ? 'inbox-bubble inbox-outgoing' : 'inbox-bubble'}>
      <p>{msg.body}</p>
      <small className="muted capitalize">{msg.direction === 'out' ? statuses.get(msg.message_id) ?? 'sent' : 'received'}</small>
    </li>)}</ol>
    {(page > 1 || messages.data.length > 50) && <nav className="row" aria-label="Message pages">
      {page > 1 && <Link href={'?page=' + (page-1)}>Newer messages</Link>}
      {messages.data.length > 50 && <Link href={'?page=' + (page+1)}>Older messages</Link>}
    </nav>}
    {writable && <>
      {consent.data?.opted_in ? <ActionForm action={sendMessage} org={orgId} label="Send message">
        {subject}
        <label>Message<textarea name="text" rows={3} maxLength={4096} /></label>
        <p className="muted text-sm">Outside the 24-hour window, choose a Meta-approved template without parameters.</p>
        <label>Fallback template name<input name="template" maxLength={128} /></label>
        <label>Template language<input name="language" maxLength={12} placeholder="en_US" /></label>
      </ActionForm> : <p role="status">{consent.data?.source === 'stop' ? 'Contact opted out with STOP.' : 'WhatsApp opt-in is required before sending.'}</p>}
      <details>
        <summary>Assignment and status</summary>
        <ActionForm action={updateConversation} org={orgId} label="Save conversation">
          {subject}
          <label>Assign to<select name="assignee" defaultValue={detail.assignee_id ?? ''}><option value="">Unassigned</option>
            {members.map(member => <option key={member.user_id} value={member.user_id}>{member.email ?? member.role}</option>)}
          </select></label>
          <label>Status<select name="status" defaultValue={detail.status}>
            <option value="open">Open</option><option value="pending">Pending</option><option value="closed">Closed</option>
          </select></label>
        </ActionForm>
      </details>
      <details>
        <summary>WhatsApp consent</summary>
        <ActionForm action={recordConsent} org={orgId} label="Record consent">
          {subject}
          <p>Record opt-in only after the contact has explicitly agreed to WhatsApp messages.</p>
          <label>Consent<select name="consent" defaultValue="" required>
            <option value="" disabled>Choose consent status</option><option value="true">Explicit opt-in received</option><option value="false">Opt out</option>
          </select></label>
        </ActionForm>
      </details>
    </>}
    <h3>Internal notes</h3>
    {notes.data.map(note => <p className="inbox-bubble" key={note.id}>{note.body}</p>)}
    {writable && <ActionForm action={addNote} org={orgId} label="Add note">
      {subject}<label>Internal note<textarea name="note" maxLength={2000} rows={2} required /></label>
    </ActionForm>}
  </section>;
}
