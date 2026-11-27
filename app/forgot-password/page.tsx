import Link from 'next/link';
import { requestRecovery } from './actions';

export default async function ForgotPassword({searchParams}: {searchParams: Promise<{status?: string}>}) {
  const {status} = await searchParams;
  return <main className="single card stack">
    <h1>Reset password</h1>
    {status === 'sent' ? <p role="status">If this account can receive a reset email, open the newest link in this same browser.</p> :
    <form action={requestRecovery} className="stack">
      <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      <button className="button button-primary">Send reset link</button>
    </form>}
    {status === 'invalid' && <p role="alert">Enter a valid email address.</p>}
    {status === 'expired' && <p role="alert">This link is expired or was opened in a different browser. Request a new one.</p>}
    {status === 'retry' && <p role="alert">Could not send a reset link right now. Try again later.</p>}
    <Link href="/login">Back to sign in</Link>
  </main>;
}
