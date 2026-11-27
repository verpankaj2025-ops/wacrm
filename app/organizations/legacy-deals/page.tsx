import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { signOut } from '../../actions';

export default async function ExistingDeals({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (process.env.RELAXIO_DATA_MODE !== 'wacrm') notFound();
  const client = await supabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');
  const requested = (await searchParams).page;
  const page = typeof requested === 'string' && /^[1-9]\d{0,4}$/.test(requested) ? Number(requested) : 1;
  const offset = (page - 1) * 40;
  const { data, error } = await client.from('deals')
    .select('id,title,value,currency,status,pipeline_stages(name),pipelines(name)')
    .order('created_at', { ascending: false }).order('id').range(offset, offset + 40);
  const deals = (data ?? []) as unknown as Array<{
    id: string; title: string; value: number | null; currency: string | null; status: string | null;
    pipeline_stages: { name: string } | null; pipelines: { name: string } | null;
  }>;
  return <>
    <header className="topbar"><span>Relaxio CRM</span>
      <form action={signOut}><button className="button button-outline">Sign out</button></form>
    </header>
    <main className="workspace stack">
      <h1>Existing deals</h1>
      <p className="muted">Read-only view of the deals your wacrm account can access.</p>
      {error ? <p role="alert" className="notice">Deals could not be loaded. Confirm your account has access in wacrm.</p> :
        <section className="card stack">
          {!deals.length && <p>No deals are visible to this account on this page.</p>}
          <ul className="divide">{deals.slice(0, 40).map(deal => <li key={deal.id}>
            <div><strong>{deal.title}</strong>
              <p className="muted">{[deal.pipelines?.name, deal.pipeline_stages?.name, deal.status].filter(Boolean).join(' · ')}</p>
            </div>
            {deal.value !== null && <span>{deal.currency} {deal.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>}
          </li>)}</ul>
          {(page > 1 || deals.length > 40) && <nav aria-label="Deal pages" className="row">
            {page > 1 && <Link href={'?page=' + (page - 1)}>Previous</Link>}
            {deals.length > 40 && <Link href={'?page=' + (page + 1)}>Next</Link>}
          </nav>}
        </section>}
    </main>
  </>;
}
