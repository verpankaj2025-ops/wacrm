import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ActionForm } from '../../components/action-form';
import { organizationAccess } from '../../lib/organization-access';
import type { ContactInput, fieldKinds } from '../../lib/contact-input';
import { uuid } from '../../lib/validation';
import { createField, createTag, importCsv, saveContact, saveFieldValue, toggleTag } from './actions';

type Contact = ContactInput & { id: string };
type Field = { slot: number; name: string; kind: typeof fieldKinds[number] };
type Tag = { id: string; name: string };

function ContactInputs({ contact }: { contact?: Contact }) {
  return <>
    {contact && <input type="hidden" name="id" value={contact.id} />}
    <label>Name<input name="name" maxLength={120} defaultValue={contact?.name} required /></label>
    <label>Phone<input name="phone" type="tel" maxLength={80} defaultValue={contact?.phone_e164} required /></label>
    <label>Type<select name="kind" defaultValue={contact?.kind ?? 'contact'}>
      <option value="contact">Contact</option><option value="lead">Lead</option>
    </select></label>
  </>;
}

function CustomValue({ field, value }: { field: Field; value: string }) {
  if (field.kind === 'boolean') return <select name="value" defaultValue={value}>
    <option value="">Unset</option><option value="true">Yes</option><option value="false">No</option>
  </select>;
  const type = field.kind === 'text' ? 'text' : field.kind;
  return <input name="value" type={type} maxLength={500} defaultValue={value}
    step={type === 'number' ? 'any' : undefined} />;
}

export default async function Contacts({ searchParams }: { searchParams: Promise<{ contact?: string; page?: string }> }) {
  const access = await organizationAccess();
  if (!access) redirect('/login');
  if (!access.org) redirect('/organizations');
  const { client, writable } = access;
  const org = access.org.org_id;
  const params = await searchParams;
  const selected = params.contact ? uuid.safeParse(params.contact) : undefined;
  if (selected && !selected.success) notFound();
  const pageNum = typeof params.page === 'string' && /^[1-9]\d{0,5}$/.test(params.page) ? Number(params.page) : 1;
  const offset = (pageNum - 1) * 40;
  const [list, tagResult, fieldResult, selectedResult] = await Promise.all([
    client.from('contacts').select('id,name,phone_e164,kind').eq('org_id', org).order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(offset, offset + 40),
    client.from('contact_tags').select('id,name').eq('org_id', org).order('name'),
    client.from('contact_fields').select('slot,name,kind').eq('org_id', org).order('slot'),
    selected?.success ? client.from('contacts').select('id,name,phone_e164,kind').eq('org_id', org).eq('id', selected.data).limit(1) : null,
  ]);
  if (list.error || tagResult.error || fieldResult.error || selectedResult?.error) throw new Error('Could not load contacts.');
  const contacts: Contact[] = list.data;
  const tags: Tag[] = tagResult.data;
  const fields: Field[] = fieldResult.data;
  const contact: Contact | undefined = selectedResult?.data[0];
  if (selected?.success && !contact) notFound();
  const [links, values] = contact ? await Promise.all([
    client.from('contact_tag_links').select('tag_id').eq('org_id', org).eq('contact_id', contact.id),
    client.from('contact_field_values').select('field_slot,value').eq('org_id', org).eq('contact_id', contact.id),
  ]) : [null, null];
  if (links?.error || values?.error) throw new Error('Could not load contact details.');
  const attached = new Set(links?.data?.map(row => row.tag_id));
  const fieldValues = new Map(values?.data?.map(row => [row.field_slot, String(row.value)]));
  return <>
    <header className="topbar"><Link href="/organizations">Organizations</Link><span>{access.org.name}</span></header>
    <main className="workspace stack" key={org}>
      <h1>Contacts and leads</h1>
      <div className="workspace-grid">
        <aside className="stack">
          <section className="card stack">
            <h2>Directory</h2>
            {!contacts.length && <p>No contacts on this page.</p>}
            <ul className="divide">
              {contacts.slice(0, 40).map(item => <li key={item.id}>
                <div><Link href={'/contacts?' + new URLSearchParams({ contact: item.id, page: String(pageNum) })}>{item.name}</Link>
                  <p className="muted">{item.phone_e164} · {item.kind}</p></div>
              </li>)}
            </ul>
            {(pageNum > 1 || contacts.length > 40) && <nav aria-label="Contact pages" className="row">
              {pageNum > 1 && <Link href={'/contacts?page=' + (pageNum - 1)}>Previous</Link>}
              {contacts.length > 40 && <Link href={'/contacts?page=' + (pageNum + 1)}>Next</Link>}
            </nav>}
          </section>
          {writable && <section className="card stack">
            <h2>Import contacts</h2>
            <p className="muted text-sm">Use name, phone and optional kind columns. Up to 500 rows and 256 KiB. Local numbers default to India.</p>
            <ActionForm action={importCsv} org={org} label="Import CSV">
              <label>CSV file<input name="csv" type="file" accept=".csv,text/csv" required /></label>
            </ActionForm>
          </section>}
        </aside>
        <div className="stack" key={contact?.id ?? 'new'}>
          {contact && <section className="card stack">
            <h2>{contact.name}</h2>
            {writable && <Link href={'/pipeline?contact=' + contact.id}>Create a deal for this contact</Link>}
            {writable ? <ActionForm action={saveContact} org={org} label="Save contact">
              <ContactInputs contact={contact} />
            </ActionForm> : <p>{contact.phone_e164} · {contact.kind}</p>}
            <h3>Tags</h3>
            {tags.filter(tag => writable || attached.has(tag.id)).length === 0 && <p className="muted">No tags.</p>}
            {tags.filter(tag => writable || attached.has(tag.id)).map(tag => writable ?
              <ActionForm key={tag.id} action={toggleTag} org={org} label={attached.has(tag.id) ? 'Remove ' + tag.name : 'Attach ' + tag.name}>
                <input type="hidden" name="id" value={contact.id} />
                <input type="hidden" name="tag" value={tag.id} />
                <input type="hidden" name="operation" value={attached.has(tag.id) ? 'remove' : 'attach'} />
              </ActionForm> : <p key={tag.id}>{tag.name}</p>)}
            <h3>Custom fields</h3>
            {!fields.length && <p className="muted">No custom fields.</p>}
            {fields.map(field => writable ? <ActionForm key={field.slot} action={saveFieldValue} org={org} label={'Save ' + field.name}>
              <input type="hidden" name="id" value={contact.id} />
              <input type="hidden" name="slot" value={field.slot} />
              <label>{field.name}<CustomValue field={field} value={fieldValues.get(field.slot) ?? ''} /></label>
            </ActionForm> : <p key={field.slot}>{field.name} · {fieldValues.get(field.slot) ?? 'Unset'}</p>)}
          </section>}
          {writable && <>
            <section className="card stack"><h2>Add contact</h2>
              <ActionForm action={saveContact} org={org} label="Add contact"><ContactInputs /></ActionForm>
            </section>
            <section className="card stack"><h2>Tags and custom fields</h2>
              <ActionForm action={createTag} org={org} label="Create tag">
                <label>Tag name<input name="name" maxLength={48} required /></label>
              </ActionForm>
              <ActionForm action={createField} org={org} label="Create custom field">
                <label>Field name<input name="name" maxLength={48} required /></label>
                <label>Field type<select name="kind">
                  <option value="text">Text</option><option value="number">Number</option>
                  <option value="boolean">Yes or no</option><option value="date">Date</option>
                </select></label>
              </ActionForm>
            </section>
          </>}
        </div>
      </div>
    </main>
  </>;
}
