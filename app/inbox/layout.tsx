import type { ReactNode } from 'react';
import Link from 'next/link';
import { InboxRefresh } from '../../components/inbox-refresh';
import { inboxAccess } from '../../lib/whatsapp/inbox';

type Thread = {id:string;status:string;contacts:{name:string}|null};
export default async function InboxLayout({children}:{children:ReactNode}) {
  const {client,org} = await inboxAccess();
  const {data,error} = await client.from('whatsapp_conversations')
    .select('id,status,contacts(name)').eq('org_id',org.org_id).order('activity_at',{ascending:false}).order('id').limit(100);
  if (error) throw new Error('Could not load the WhatsApp inbox.');
  const threads = data as unknown as Thread[];
  return <>
    <header className="topbar"><Link href="/organizations">Organizations</Link><span>{org.name}</span></header>
    <main className="workspace stack">
      <h1>WhatsApp inbox</h1>
      <InboxRefresh />
      <div className="inbox-grid">
        <nav className="card stack inbox-list" aria-label="Conversations">
          <h2>Conversations</h2>
          {!threads.length && <p>No WhatsApp conversations yet.</p>}
          <ul className="divide">{threads.map(thread => <li key={thread.id}>
            <div><Link href={'/inbox/' + thread.id}>{thread.contacts?.name ?? 'Contact'}</Link>
              <p className="muted capitalize">{thread.status}</p></div>
          </li>)}</ul>
          <Link href="/inbox">Inbox settings</Link>
        </nav>
        {children}
      </div>
    </main>
  </>;
}
