import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { InviteForm } from '../../components/invite-form';
import { supabase } from '../../lib/supabase';
import { roles, type Role } from '../../lib/validation';
import { changeMembership, createOrganization, revokeInvitation, signOut, switchOrganization } from '../actions';

type Member = { user_id: string; role: Role; email: string | null };

const messages: Record<string, string> = {
  access: 'You do not have permission for that action.',
  name: 'Enter a name between 2 and 80 characters.',
  create: 'The organization could not be created. Check that your email is confirmed.',
  owner: 'An organization needs at least one owner.',
  invite: 'This invitation is unavailable.',
  signout: 'We could not sign you out. Please try again.',
};

export default async function Organizations({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (process.env.RELAXIO_DATA_MODE === "wacrm") redirect("/organizations/legacy-deals");
  const client = await supabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');
  const { data: organizations, error } = await client.from('organizations').select('org_id,name').order('name').order('org_id');
  if (error) throw new Error('Could not load organizations');
  const preference = (await cookies()).get('relaxio-org')?.value;
  const active = organizations.find(org => org.org_id === preference) ?? organizations[0];
  const org = active?.org_id;
  const roster = org ? await client.rpc('organization_roster', { p_org: org }) : null;
  if (roster?.error) throw new Error('Could not load members');
  const members: Member[] = roster?.data ?? [];
  const role = members.find(member => member.user_id === user.id)?.role;
  const manager = role === 'owner' || role === 'admin';
  const invitations = manager && org ? await client.from('invitations')
    .select('id,email,role,expires_at,accepted_at,revoked_at').eq('org_id', org)
    .is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString())
    .order('expires_at').limit(50) : null;
  if (invitations?.error) throw new Error('Could not load invitations');
  const { status } = await searchParams;

  return <>
    <header className="topbar">
      <span><span aria-hidden="true">✳ </span>Relaxio CRM</span>
      <form action={signOut}><Button variant="outline">Sign out</Button></form>
    </header>
    <main className="workspace stack">
      <h1>{active ? active.name : 'Create your organization'}</h1>
      {active && <Link href="/contacts">Contacts and leads</Link>}
      {active && <Link href="/pipeline">Pipeline</Link>}
      {active && <Link href="/inbox">WhatsApp inbox</Link>}
      {active && <Link href="/automations">Automations</Link>}
      {status && Object.hasOwn(messages, status) && <p role="status" className="notice">{messages[status]}</p>}
      <div className="workspace-grid">
        <aside className="stack">
          {active && <section className="card stack">
            <h2>Organizations</h2>
            <form action={switchOrganization} className="stack">
              <label>Active organization<select name="org" defaultValue={org} key={org}>
                {organizations.map(item => <option key={item.org_id} value={item.org_id}>{item.name}</option>)}
              </select></label>
              <Button variant="outline">Switch organization</Button>
            </form>
          </section>}
          <section className="card stack">
            {active && <h2>New organization</h2>}
            <form action={createOrganization} className="stack">
              <label>Organization name<input name="name" minLength={2} maxLength={80} required /></label>
              <Button>Create organization</Button>
            </form>
          </section>
        </aside>
        {active && <div className="stack">
          <section className="card stack">
            <h2>Members</h2>
            <ul className="divide">
              {members.map(member => <li key={member.user_id}>
                <div><span>{member.email ?? 'Member'}{member.user_id === user.id && ' (you)'}</span>
                  <p className="muted text-sm capitalize">{member.role}</p></div>
                {(role === 'owner' || (role === 'admin' && ['agent', 'viewer'].includes(member.role))) && (
                  <form action={changeMembership} className="row">
                    <input type="hidden" name="org" value={org} />
                    <input type="hidden" name="user" value={member.user_id} />
                    <select name="role" aria-label={'Change role for ' + (member.email ?? 'member')} defaultValue={member.role}>
                      {(role === 'owner' ? roles : ['agent', 'viewer']).map(item => <option key={item} value={item}>{item}</option>)}
                      <option value="remove">Remove member</option>
                    </select>
                    <Button variant="outline">Save</Button>
                  </form>
                )}
              </li>)}
            </ul>
          </section>
          {manager && org && <section className="card stack">
            <h2>Invite a teammate</h2>
            <InviteForm key={org} org={org} owner={role === 'owner'} />
            {!!invitations?.data?.length && <>
              <h3>Pending invitations</h3>
              <ul className="divide">
                {invitations.data.map(invite => <li key={invite.id}>
                  <div>{invite.email}<p className="muted text-sm capitalize">{invite.role}</p></div>
                  {(role === 'owner' || invite.role !== 'admin') && <form action={revokeInvitation}>
                    <input type="hidden" name="org" value={org} />
                    <input type="hidden" name="invite" value={invite.id} />
                    <Button variant="outline">Revoke</Button>
                  </form>}
                </li>)}
              </ul>
            </>}
          </section>}
        </div>}
      </div>
    </main>
  </>;
}
