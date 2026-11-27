import Link from 'next/link';
import { acceptInvitation } from '../../actions';
import { Button } from '../../../components/ui/button';
import { supabase } from '../../../lib/supabase';
import { token } from '../../../lib/validation';

export default async function Join({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const raw = (await params).token;
  if (!token.safeParse(raw).success) {
    return <main className="single card"><h1>Invitation unavailable</h1><Link href="/organizations">Organizations</Link></main>;
  }
  const client = await supabase();
  const { data: { user } } = await client.auth.getUser();
  const { status } = await searchParams;
  const query = new URLSearchParams({ next: '/join/' + raw });
  return (
    <main className="single card stack">
      <p className="eyebrow">Relaxio CRM</p>
      <h1>Join an organization</h1>
      <p>Use the verified email address that received the invitation.</p>
      {status === 'invite' && <p className="notice" role="status">This invitation is unavailable for your account.</p>}
      {status === 'rate' && <p className="notice" role="status">Please wait before trying again.</p>}
      {user ? <form action={acceptInvitation} className="stack">
        <p className="muted">Signed in as {user.email}</p>
        <input type="hidden" name="token" value={raw} />
        <Button>Accept invitation</Button>
      </form> : <>
        <Link className="button button-primary" href={'/login?' + query}>Sign in</Link>
        <Link href={'/signup?' + query}>Create an account</Link>
      </>}
    </main>
  );
}
