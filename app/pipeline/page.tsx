import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../components/action-form';
import { uuid } from '../../lib/validation';
import { organizationAccess } from '../../lib/organization-access';
import { addDeal, addStage, moveDeal, linkConversation } from './actions';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

type Stage = { id: string; name: string };
type Deal = {
  id: string;
  title: string;
  stage_id: string;
  contact_id: string;
  conversation_id: string | null;
  amount_inr: number;
  contacts: { name: string } | null;
};

export default async function Pipeline({ searchParams }: {
  searchParams: Promise<{ page?: string; contact?: string }>;
}) {
  const access = await organizationAccess();
  if (!access) redirect('/login');
  if (!access.org) redirect('/organizations');
  const { client, writable } = access;
  const org = access.org.org_id;
  const params = await searchParams;
  const page = typeof params.page === 'string' && /^[1-9]\d{0,5}$/.test(params.page) ? Number(params.page) : 1;
  const preferredContact = uuid.safeParse(params.contact);
  const offset = (page - 1) * 60;
  const [stagesResult, dealsResult, contactsResult, preferredResult] = await Promise.all([
    client.from('pipeline_stages').select('id,name').eq('org_id', org).order('position').order('name').order('id'),
    client.from('deals').select('id,title,stage_id,contact_id,conversation_id,amount_inr,contacts(name)').eq('org_id', org)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 60),
    writable ? client.from('contacts').select('id,name').eq('org_id', org).order('name').order('id').limit(101) : null,
    writable && preferredContact.success
      ? client.from('contacts').select('id,name').eq('org_id', org).eq('id', preferredContact.data).limit(1) : null,
  ]);
  if (stagesResult.error || dealsResult.error || contactsResult?.error || preferredResult?.error) throw new Error('Could not load the pipeline.');
  const stages: Stage[] = stagesResult.data;
  const deals = (dealsResult.data as unknown as Deal[]).slice(0, 60);
  const dealContactIds = [...new Set(deals.map(deal => deal.contact_id))];
  const conversations = writable && dealContactIds.length ? await client.from('whatsapp_conversations')
    .select('id,contact_id,phone_number_id,status').eq('org_id',org).in('contact_id',dealContactIds).order('id') : null;
  if (conversations?.error) throw new Error('Could not load conversation links.');
  const threadsByContact = Map.groupBy(conversations?.data ?? [],thread => thread.contact_id);
  const preferred = preferredResult?.data?.[0];
  const contacts = contactsResult?.data ?? [];
  const options = preferred ? [preferred, ...contacts.filter(contact => contact.id !== preferred.id).slice(0, 99)]
    : contacts.slice(0, 100);
  const dealsByStage = Map.groupBy(deals, deal => deal.stage_id);
  const pageLink = (next: number) => '/pipeline?' + new URLSearchParams({ page: String(next), ...(preferred && { contact: preferred.id }) });

  return <>
    <header className="topbar"><Link href="/organizations">Organizations</Link><span>{access.org.name}</span></header>
    <main className="workspace stack" key={org}>
      <h1>Pipeline</h1>
      {!stages.length && <p className="muted">{writable ? 'Add a stage to start your pipeline.' : 'This organization has no pipeline stages yet.'}</p>}
      <div className="pipeline-board">
        {stages.map(stage => <section className="card stack" aria-label={stage.name} key={stage.id}>
          <h2>{stage.name}</h2>
          {!dealsByStage.get(stage.id)?.length && <p className="muted">No deals on this page.</p>}
          {dealsByStage.get(stage.id)?.map(deal => <article className="pipeline-deal stack" key={deal.id}>
            <h3>{deal.title}</h3>
            {deal.contacts && <Link href={'/contacts?contact=' + deal.contact_id}>{deal.contacts.name}</Link>}
            <p>{currency.format(deal.amount_inr)}</p>
            {deal.conversation_id && <Link href={'/inbox/' + deal.conversation_id}>WhatsApp conversation</Link>}
            {writable && (deal.conversation_id || threadsByContact.has(deal.contact_id)) && <details>
              <summary>Conversation link</summary>
              <ActionForm action={linkConversation} org={org} label="Save conversation link">
                <input type="hidden" name="deal" value={deal.id} />
                <label>Conversation<select name="conversation" defaultValue={deal.conversation_id ?? ''}>
                  <option value="">No conversation</option>
                  {deal.conversation_id && !threadsByContact.get(deal.contact_id)?.some(thread => thread.id === deal.conversation_id)
                    && <option value={deal.conversation_id}>Currently linked conversation</option>}
                  {threadsByContact.get(deal.contact_id)?.map(thread => <option key={thread.id} value={thread.id}>
                    {thread.status} · channel {thread.phone_number_id}
                  </option>)}
                </select></label>
              </ActionForm>
            </details>}
            {writable && stages.length > 1 && <ActionForm action={moveDeal} org={org} label="Move deal">
              <input type="hidden" name="deal" value={deal.id} />
              <input type="hidden" name="from" value={stage.id} />
              <label>Move to stage<select name="to" defaultValue="" required>
                <option value="" disabled>Choose a stage</option>
                {stages.filter(target => target.id !== stage.id).map(target => <option key={target.id} value={target.id}>{target.name}</option>)}
              </select></label>
            </ActionForm>}
          </article>)}
        </section>)}
      </div>
      {(page > 1 || dealsResult.data.length > 60) && <nav className="row" aria-label="Deal pages">
        {page > 1 && <Link href={pageLink(page - 1)}>Previous deals</Link>}
        {dealsResult.data.length > 60 && <Link href={pageLink(page + 1)}>Next deals</Link>}
      </nav>}
      {writable && <div className="workspace-grid">
        <section className="card stack">
          <h2>Add stage</h2>
          <ActionForm action={addStage} org={org} label="Add stage">
            <label>Stage name<input name="name" maxLength={60} required /></label>
            <label>Position<input name="position" type="number" min={1} max={10000} step={1} defaultValue={100} required /></label>
          </ActionForm>
        </section>
        {!!stages.length && <section className="card stack">
          <h2>Add deal</h2>
          {contacts.length > 100 && <Link href="/contacts">Choose another contact from the directory</Link>}
          {!options.length ? <Link href="/contacts">Add a contact first</Link> :
            <ActionForm action={addDeal} org={org} label="Add deal" key={preferred?.id}>
              <label>Deal title<input name="title" maxLength={120} required /></label>
              <label>Contact<select name="contact" required defaultValue={preferred?.id ?? ''}>
                <option value="" disabled>Choose a contact</option>
                {options.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
              </select></label>
              <label>Stage<select name="stage">{stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
              <label>Amount in INR<input name="amount" inputMode="decimal" defaultValue="0" maxLength={13} required /></label>
            </ActionForm>}
        </section>}
      </div>}
    </main>
  </>;
}
